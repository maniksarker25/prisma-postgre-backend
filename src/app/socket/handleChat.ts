import { PrismaClient } from "@prisma/client";
import { Server as IOServer, Socket } from "socket.io";
import { getSingleConversation } from "../helpers/getSingleConversation";
import { emitError } from "./helper";
// Import your custom helper - ensure it's also converted to Prisma

const prisma = new PrismaClient();

const handleChat = async (io: IOServer, socket: Socket, currentUserId: string): Promise<void> => {
  socket.on("send-message", async (data) => {
    const { receiver, projectId, groupId, bondLinkId, text, imageUrl, videoUrl, pdfUrl } = data;

    // 1. Validation
    if (!receiver && !projectId && !groupId && !bondLinkId) {
      return emitError(socket, {
        code: 400,
        message: "Receiver or context ID required",
        type: "general",
        details: "Provide receiverId, projectId, groupId, or bondLinkId",
      });
    }

    try {
      let conversationId: string;
      let participants: string[] = [];

      // --- Scenario A: One-to-One Chat ---
      if (receiver) {
        let conversation = await prisma.conversation.findFirst({
          where: {
            type: "ONE_TO_ONE", // Ensure this matches your Prisma Enum
            participants: { hasEvery: [currentUserId, receiver] },
          },
        });

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              type: "ONE_TO_ONE",
              participants: [currentUserId, receiver],
            },
          });
        }
        conversationId = conversation.id;
        participants = [currentUserId, receiver];
      }

      // --- Scenario B: Group/Project/BondLink ---
      else {
        const contextField = projectId ? "projectId" : groupId ? "groupId" : "bondLinkId";
        const contextId = projectId || groupId || bondLinkId;

        const conversation = await prisma.conversation.findFirst({
          where: { [contextField]: contextId },
        });

        if (!conversation) {
          return emitError(socket, {
            code: 404,
            message: "Conversation not found",
            type: "general",
          });
        }
        conversationId = conversation.id;
        participants = conversation.participants;
      }

      // 2. Create Message
      const saveMessage = await prisma.message.create({
        data: {
          text: text || "",
          imageUrl: imageUrl || [],
          videoUrl: videoUrl || [],
          pdfUrl: pdfUrl || [],
          msgByUserId: currentUserId,
          conversationId: conversationId,
        },
        include: {
          // Equivalent of Mongoose .populate()
          sender: {
            select: { name: true, profile_image: true },
          },
        },
      });

      // 3. Update Last Message in Conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageId: saveMessage.id },
      });

      // 4. Emit to Participants
      const messageEventName = receiver
        ? `message-${receiver}`
        : `message-${projectId || groupId || bondLinkId}`;

      // Emit the message and updated conversation list to everyone involved
      await Promise.all(
        participants.map(async (pId) => {
          // Send actual message
          // For 1:1, we swap the ID in the event name so both see it
          const eventTag =
            receiver && pId === receiver ? `message-${currentUserId}` : messageEventName;
          io.to(pId).emit(eventTag, saveMessage);

          // Send updated conversation list item
          const updatedConv = await getSingleConversation(conversationId, pId);
          io.to(pId).emit("conversation", updatedConv);
        })
      );
    } catch (error: any) {
      console.error("Chat Error:", error);
      emitError(socket, { code: 500, message: "Internal server error", type: "general" });
    }
  });

  // --- "Seen" Status Update ---
  socket.on("seen", async ({ conversationId, msgByUserId }) => {
    try {
      await prisma.message.updateMany({
        where: {
          conversationId,
          msgByUserId,
          seen: false,
        },
        data: { seen: true },
      });

      // Update UI for both users
      const [convSender, convReceiver] = await Promise.all([
        getSingleConversation(conversationId, currentUserId),
        getSingleConversation(conversationId, msgByUserId),
      ]);

      io.to(currentUserId).emit("conversation", convSender);
      io.to(msgByUserId).emit("conversation", convReceiver);
    } catch (error) {
      console.error("Seen event error:", error);
    }
  });
};

export default handleChat;
