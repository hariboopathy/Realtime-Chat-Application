import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  room: { type: String, required: true },
  time: { type: String } 
}, { timestamps: true });

export default mongoose.model("Message", MessageSchema);
