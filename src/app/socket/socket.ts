/* eslint-disable no-console */
import { Server as HTTPServer } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Server as IOServer, Socket } from "socket.io";
import config from "../config";

let io: IOServer;

const initializeSocket = (server: HTTPServer) => {
  if (!io) {
    io = new IOServer(server, {
      pingTimeout: 60000,
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:3000",
          "https://bankybondy.com",
          // ... add other origins as needed
        ],
      },
    });

    const onlineUser = new Set();

    io.on("connection", async (socket: Socket) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
          console.error("No token provided");
          return socket.disconnect();
        }

        const decode = jwt.verify(token, config.jwt_access_secret as string) as JwtPayload;

        // With Prisma, ensure your JWT payload uses the correct field name (e.g., profileId)
        const currentUserId = decode.profileId;

        if (!currentUserId) return socket.disconnect();

        // Join personal room for private notifications
        socket.join(currentUserId);

        onlineUser.add(currentUserId);

        // Broadcast online users
        io.emit("onlineUser", Array.from(onlineUser));

        // Handle Chat logic
        // await handleChat(io, socket, currentUserId);

        socket.on("disconnect", () => {
          onlineUser.delete(currentUserId);
          io.emit("onlineUser", Array.from(onlineUser));
          console.log("User disconnected:", currentUserId);
        });
      } catch (error) {
        console.error("Socket Auth Error:", error);
        socket.disconnect();
      }
    });
  }
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized.");
  }
  return io;
};

export { getIO, initializeSocket };
