/* eslint-disable @typescript-eslint/no-explicit-any */

import prisma from "../utils/prisma";

type PopulateField = "participants";

export const getSingleConversation = async (
  conversationId: string,
  currentUserId: string,
  populateField?: PopulateField
) => {
  // Fetch conversation with lastMessage
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
    },
    include: {
      lastMessage: true,
      messages: false,
    },
  });

  if (!conversation) return null;

  // Count unseen messages
  const unseenMsg = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      msgByUserId: {
        not: currentUserId,
      },
      seen: false,
    },
  });

  let otherUser: any = null;

  // Populate participants manually (NormalUser)
  if (populateField === "participants") {
    const users = await prisma.normalUser.findMany({
      where: {
        id: {
          in: conversation.participants,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        profile_image: true,
      },
    });

    otherUser = users.find((user) => user.id !== currentUserId);
  }

  return {
    _id: conversation.id,
    userData:
      populateField === "participants" && otherUser
        ? {
            _id: otherUser.id,
            name: otherUser.name,
            email: otherUser.email,
            profileImage: otherUser.profile_image,
          }
        : null,
    unseenMsg,
    lastMessage: conversation.lastMessage,
    type: conversation.type,
  };
};
