// import { Server } from "http";
// import app from "./app";
// import config from "./app/config";

// const main = async () => {
//   let server: Server;
//   server = app.listen(config.port, () => {
//     console.log(`Flat share server listening on port ${config.port}`);
//   });
// };
// main();
import { Server } from "http";
import app from "./app";
import config from "./app/config";
import { initializeSocket } from "./app/socket/socket"; // Import your socket setup

const main = async () => {
  let server: Server;

  // 1. Start the HTTP server
  server = app.listen(config.port, () => {
    console.log(`Flat share server listening on port ${config.port}`);
  });

  // 2. Initialize Socket.io by passing the server instance
  initializeSocket(server);

  // 3. Optional: Handle process termination
  process.on("unhandledRejection", (error) => {
    console.error("Unhandled Rejection:", error);
    if (server) {
      server.close(() => process.exit(1));
    }
  });
};

main();
