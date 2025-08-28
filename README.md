Real-Time Chat Application

A real-time chat application built with Vue.js (frontend), Node.js + Express (backend), Socket.IO for WebSocket communication, and MongoDB for storing chat history.

This application allows users to join chat rooms, send messages in real-time, see online/offline users, and view message history.

Features

User Authentication: Users log in with a username (no password).

Real-Time Messaging: Instant messaging using WebSockets (Socket.IO).

Chat Rooms: Join or create rooms dynamically.

Online/Offline Status: View active and offline users.

Typing Indicator: Shows who is typing.

Message History: Loads the last 50 messages when joining a room.

Dark/Light Theme Toggle.

Responsive UI for desktop and mobile.

🛠 Tech Stack

Frontend: Vue.js 3

Backend: Node.js + Express

WebSocket: Socket.IO

Database: MongoDB


Realtime-Chat-Application/
│
├── backend/            # Node.js + Express + Socket.IO server
│   ├── models/         # Mongoose models
│   │   ├── Message.js
│   ├── index.js       # Entry point for backend
│   └── .env.example    # Example environment variables
│
├── client/             # Vue.js frontend
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── style.css
│   │   └── index.html
│   └── vite.config.js
│
└── README.md


🚀 Local Setup & Running
1. Clone the Repository
git clone https://github.com/hariboopathy/Realtime-Chat-Application.git
cd Realtime-Chat-Application

2. Backend Setup
cd backend
npm install


Run Backend
npm start



Server runs at: http://localhost:3500

3. Frontend Setup
cd ../client
npm install

Run Frontend
npm run dev


Open browser at: http://localhost:5173


🌐 API Endpoints

POST /login → Login with username.

GET /chat?room=<room_name> → Fetch last 50 messages of a room.

🔌 WebSocket Events

message → New message broadcast.

messageDelivered → Delivery confirmation for sender.

typing → Typing indicator.

userList → Active users list.

roomList → Available rooms list.

user-connected / user-disconnected → User join/leave events.

🗄 Database Schema
Message Model
{
  "name": "JohnDoe",
  "text": "Hello!",
  "room": "General",
  "time": "2025-08-28T12:00:00Z"
}

🖼 Screenshots

Chat Login Page:

<img width="1476" height="729" alt="image" src="https://github.com/user-attachments/assets/93be4093-d5e9-4991-bb68-714dc0ce080a" />


Chat Interface:

<img width="1444" height="824" alt="image" src="https://github.com/user-attachments/assets/20911dc9-9877-4221-a9a7-da4ff1a6bc33" />

