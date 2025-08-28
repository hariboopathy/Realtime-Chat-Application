<template>
  <main class="container">
    <h1>Realtime Chat Room</h1>

    <section v-if="!isLogged">
      <div class="login-card">
        <input
          v-model="form.username"
          required
          placeholder="Type a username (no password)"
          @keyup.enter="login"
          maxlength="20"
        />
        <input
          v-model="form.room"
          required
          placeholder="Room (e.g. pizza)"
          @keyup.enter="login"
        />
        <button @click="login" :disabled="!form.username || !form.room">
          Join
        </button>
      </div>
    </section>

    <section v-else class="chat-card">
      <div class="topbar">
        <div>
          <strong>{{ user.username }}</strong> — <em>{{ user.room }}</em>
        </div>
        <div class="topbar-buttons">
          <button class="btn" @click="toggleTheme">Toggle Mode</button>
          <button class="btn leave" @click="logout">Leave</button>
        </div>
      </div>

      <div class="content">
        <!-- Sidebar -->
        <aside class="sidebar">
          <div class="panel">
            <h4>Online ({{ online.length }})</h4>
            <ul>
              <li v-for="(u, i) in online" :key="i" id="list-dot">
                <span class="status-dot"></span> {{ u.name }}
              </li>
            </ul>
          </div>
          <div class="panel">
            <h4>Offline ({{ offline.length }})</h4>
            <ul>
              <li v-for="(u, i) in offline" :key="i" id="list-dot">
                <span class="status-dot offline-dot"></span> {{ u.name }}
              </li>
            </ul>
          </div>
          <div class="panel">
            <h4>Rooms</h4>
            <div v-if="rooms.length">{{ rooms.join(", ") }}</div>
            <div v-else>—</div>
          </div>
        </aside>

        <!-- Chat Area -->
        <section class="chat-area">
          <div ref="listEl" class="messages">
            <div
              v-for="(m, i) in messages"
              :key="i"
              :class="[
                'bubble',
                m.name === user.username
                  ? 'me'
                  : m.name === 'Admin'
                  ? 'sys'
                  : 'other',
              ]"
            >
              <div class="meta">
                <b>{{ m.name }}</b>
                <span class="time">{{ formatTime(m.time) }}</span>
              </div>
              <div class="text">{{ m.text }}</div>
              <div class="status" v-if="m.name === user.username">
                <span v-if="m.status === 'sent'">✔</span>
                <span v-if="m.status === 'delivered'">✔✔</span>
              </div>
            </div>
          </div>

          <div class="typing" v-if="typingDisplay">{{ typingDisplay }}</div>

          <form class="send" @submit.prevent="sendMessage">
            <input
              v-model="msg"
              @input="onTyping"
              placeholder="Type message..."
            />
            <button id="send-btn" :disabled="!msg.trim()">Send</button>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from "vue";
import { io } from "socket.io-client";

const API = "http://localhost:3500";

const form = reactive({ username: "", room: "" });
const isLogged = ref(false);
const token = ref(null);
const user = reactive({ username: "", room: "" });
const socket = ref(null);

const messages = ref([]);
const online = ref([]);
const offline = ref([]);
const rooms = ref([]);
const msg = ref("");
const typingUsers = ref(new Set());
const typingDisplay = ref("");
const listEl = ref(null);

function formatTime(t) {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(d)
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function scrollBottom() {
  await nextTick();
  if (listEl.value) {
    listEl.value.scrollTop = listEl.value.scrollHeight;
  }
}

async function fetchChatHistory() {
  try {
    const chatRes = await fetch(`${API}/chat?room=${encodeURIComponent(user.room)}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (chatRes.ok) {
      const hist = await chatRes.json();
      messages.value = hist.map((h) => ({
        id: h._id || Date.now(),
        name: h.name,
        text: h.text,
        time: h.createdAt,
        status: "delivered",
      }));
      await scrollBottom();
    }
  } catch (err) {
    console.error("Chat history fetch error:", err);
  }
}

async function login() {
  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.username.trim() }),
    });

    if (!res.ok) throw new Error("Login failed");

    const data = await res.json();
    token.value = data.token;
    user.username = data.username;
    user.room = form.room.trim();

    localStorage.setItem("chat_token", token.value);
    localStorage.setItem("chat_user", JSON.stringify({ username: user.username }));
    localStorage.setItem("chat_room", user.room);

    isLogged.value = true;
    await fetchChatHistory();
    connectSocket();
  } catch (err) {
    alert("Error during login: " + err.message);
  }
}

function connectSocket() {
  socket.value = io(API, { auth: { token: token.value } });

  socket.value.on("connect_error", (err) => {
    alert("Connection error: " + err.message);
    console.error("Socket error", err.message);
  });

  socket.value.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
    if (reason === "io server disconnect") {
      alert("Disconnected by server. Please rejoin.");
      logout();
    }
  });

  socket.value.on("message", (m) => {
    messages.value.push({ ...m, status: "delivered" });
    scrollBottom();
  });

  socket.value.on("messageDelivered", ({ id }) => {
    const msgObj = messages.value.find((m) => m.id === id);
    if (msgObj) msgObj.status = "delivered";
  });

  socket.value.on("userList", ({ users, offlineUsers }) => {
    online.value = users || [];
    offline.value = offlineUsers || [];
  });

  socket.value.on("roomList", ({ rooms: r }) => (rooms.value = r || []));

  socket.value.on("typing", ({ name, isTyping }) => {
    if (isTyping) typingUsers.value.add(name);
    else typingUsers.value.delete(name);
    const arr = [...typingUsers.value].filter((n) => n !== user.username);
    typingDisplay.value = arr.length ? `${arr.join(", ")} typing...` : "";
  });

  socket.value.on("connect", () => {
    socket.value.emit("enterRoom", { room: user.room });
  });
}

function logout() {
  if (socket.value) socket.value.disconnect();
  token.value = null;
  localStorage.clear();
  isLogged.value = false;
  messages.value = [];
  online.value = [];
  offline.value = [];
  rooms.value = [];
  msg.value = "";
  form.username = "";
  form.room = "";
}

function sendMessage() {
  const text = msg.value.trim();
  if (!text || !socket.value) return;
  const newMsg = {
    id: Date.now().toString(),
    name: user.username,
    text,
    time: new Date().toISOString(),
    status: "sent",
  };
  messages.value.push(newMsg);
  socket.value.emit("message", newMsg);
  msg.value = "";
  socket.value.emit("typing", { isTyping: false });
  scrollBottom();
}

let typingTimer;
function onTyping() {
  if (!socket.value) return;
  socket.value.emit("typing", { isTyping: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(
    () => socket.value.emit("typing", { isTyping: false }),
    800
  );
}

const theme = ref("dark");
function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.body.className = theme.value;
}

onMounted(() => {
  document.body.className = theme.value;
  const t = localStorage.getItem("chat_token");
  const u = localStorage.getItem("chat_user");
  const r = localStorage.getItem("chat_room");

  if (t && u && r) {
    token.value = t;
    const parsed = JSON.parse(u);
    user.username = parsed.username;
    user.room = r;
    isLogged.value = true;

    fetchChatHistory().then(() => {
      connectSocket();
    });
  }
});
</script>

<style scoped>
.chat-card {
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 8px;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #4caf50;
  border-radius: 50%;
  margin-right: 6px;
}
.offline-dot {
  background: #f44336;
}
.status {
  font-size: 0.8rem;
  text-align: right;
  color: gray;
}
</style>
