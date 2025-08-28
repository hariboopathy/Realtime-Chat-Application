import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import Message from './models/Message.js';

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3500;
const JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

// Connect MongoDB
await mongoose.connect(process.env.MONGO_URL, { dbName: 'chat-app' })
  .then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('MongoDB err', err); process.exit(1); });

// In-memory state
const UsersState = {
  users: [], // { id, name, room }
  offlineUsers: [], // { name, room }
  setUsers(newArr) { this.users = newArr; },
  setOffline(newArr) { this.offlineUsers = newArr; }
};

function activateUser(id, name, room) {
  // Remove from offline if coming back
  UsersState.setOffline(UsersState.offlineUsers.filter(u => !(u.name === name && u.room === room)));

  const user = { id, name, room };
  UsersState.setUsers([
    ...UsersState.users.filter(u => u.id !== id),
    user
  ]);
  return user;
}
function userLeavesApp(id) {
  const user = getUser(id);
  if (user) {
    // Add to offline list if not already there
    if (!UsersState.offlineUsers.find(u => u.name === user.name && u.room === user.room)) {
      UsersState.offlineUsers.push({ name: user.name, room: user.room });
    }
  }
  UsersState.setUsers(UsersState.users.filter(u => u.id !== id));
}
function getUser(id) {
  return UsersState.users.find(u => u.id === id);
}
function getUsersInRoom(room) {
  return UsersState.users.filter(u => u.room === room);
}
function getOfflineUsersInRoom(room) {
  return UsersState.offlineUsers.filter(u => u.room === room);
}
function getAllActiveRooms() {
  return Array.from(new Set(UsersState.users.map(u => u.room)));
}

// Updated buildMsg to include ID and ISO time
function buildMsg(name, text) {
  return {
    id: Date.now().toString(),
    name,
    text,
    time: new Date().toISOString()
  };
}

// --- REST Endpoints ---
app.post('/login', (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: 'username required' });
  const payload = { username: username.trim() };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  return res.json({ ok: true, token, username: payload.username });
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization' });
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/chat', authMiddleware, async (req, res) => {
  const room = (req.query.room || '').toString();
  if (!room) return res.status(400).json({ error: 'room query required' });
  const last50 = await Message.find({ room }).sort({ createdAt: -1 }).limit(50).lean();
  res.json(last50.reverse());
});

// --- Socket.IO ---
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: true }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth token required'));
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.username = payload.username;
    return next();
  } catch (err) {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const username = socket.data.username || `User-${socket.id.slice(0,4)}`;
  console.log(`Socket connected: ${socket.id} as ${username}`);

  socket.emit('message', buildMsg('Admin', `Welcome ${username}!`));

  socket.on('enterRoom', async ({ room }) => {
    const prev = getUser(socket.id)?.room;
    if (prev) {
      socket.leave(prev);
      io.to(prev).emit('message', buildMsg('Admin', `${username} left the room`));
      io.to(prev).emit('userList', {
        users: getUsersInRoom(prev).map(u => ({ name: u.name })),
        offlineUsers: getOfflineUsersInRoom(prev)
      });
    }

    const user = activateUser(socket.id, username, room);
    socket.join(room);

    const history = await Message.find({ room }).sort({ createdAt: -1 }).limit(50).lean();
    history.reverse().forEach(m => {
      socket.emit('message', { id: m._id.toString(), name: m.name, text: m.text, time: m.time || m.createdAt });
    });

    socket.emit('message', buildMsg('Admin', `You have joined the ${room} chat room`));
    socket.broadcast.to(room).emit('message', buildMsg('Admin', `${username} has joined the room`));

    io.to(room).emit('userList', {
      users: getUsersInRoom(room).map(u => ({ name: u.name })),
      offlineUsers: getOfflineUsersInRoom(room)
    });
    io.emit('roomList', { rooms: getAllActiveRooms() });
  });

  // Handle sending message
  socket.on('message', async (msg) => {
    const user = getUser(socket.id);
    if (!user?.room) return;
    const newMsg = { ...msg, status: 'delivered', time: new Date().toISOString() };

    try {
      await Message.create({ name: user.name, text: msg.text, room: user.room, time: newMsg.time });
    } catch (e) {
      console.error('Failed to save message', e);
    }

    socket.emit('messageDelivered', { id: msg.id });
    socket.broadcast.to(user.room).emit('message', newMsg);
  });

  socket.on('typing', ({ isTyping }) => {
    const user = getUser(socket.id);
    if (!user?.room) return;
    socket.broadcast.to(user.room).emit('typing', { name: username, isTyping: !!isTyping });
  });

  socket.on('disconnect', () => {
    const user = getUser(socket.id);
    userLeavesApp(socket.id);
    if (user) {
      io.to(user.room).emit('message', buildMsg('Admin', `${user.name} has left the room`));
      io.to(user.room).emit('userList', {
        users: getUsersInRoom(user.room).map(u => ({ name: u.name })),
        offlineUsers: getOfflineUsersInRoom(user.room)
      });
      io.emit('roomList', { rooms: getAllActiveRooms() });
    }
    console.log('Socket disconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
