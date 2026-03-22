# AstroBot n8n Workflow — Step-by-Step Guide

This document explains how the **n8n workflow** powers AstroBot's AI brain. The workflow receives messages from the AstroBot backend, processes them (including voice messages), and returns AI-generated responses.

---

## What is n8n?

**n8n** is a visual workflow automation tool. Instead of writing code, you connect nodes (boxes) to create a pipeline. Each node does one job, and data flows from one to the next.

---

## Workflow Overview

```
User sends message (text or voice)
        ↓
    Webhook (receives it)
        ↓
    Switch (is it text or audio?)
        ↓
   ┌────┴────┐
   │         │
 Audio    Text
   │         │
   ↓         ↓
Transcribe  Format
   │         │
   └────┬────┘
        ↓
   AI Agent (Mistral + SerpAPI + Think)
        ↓
   Format response
        ↓
   Send back to user
```

---

## Step-by-Step Explanation

### Step 1: Webhook — The Entry Point

**What it does:**  
The Webhook is like a mailbox. When someone sends a message in the AstroBot chat, the AstroBot backend calls the n8n webhook URL with the message data.

**Example of what the backend sends:**
```json
{
  "user_id": 42,
  "user_name": "John",
  "user_surname": "Doe",
  "message": "What is the weather in Paris today?",
  "session_id": "session_123",
  "audio": null,
  "conversation_history": [
    { "role_user": "Hello!", "role_assistant": "Hi Commander! How can I help?" }
  ]
}
```

If the user recorded **voice**, the `audio` field will contain a Base64-encoded sound file instead of `null`.

**Why it matters:**  
Without the Webhook, n8n would not receive any data. This is the trigger that starts the whole workflow.

---

### Step 2: Switch — Text or Audio?

**What it does:**  
The Switch node checks the incoming data and decides which path to take:

- **Path A (Audio):** If `audio` has data → go to transcription
- **Path B (Text):** If `message` has text → skip transcription

**Example:**
- User types "Hello" → Switch sends to **Path B** (text)
- User clicks mic and speaks "Hello" → Switch sends to **Path A** (audio)

**Why it matters:**  
Voice and text need different processing. Voice must be converted to text first; text can go straight to the AI.

---

### Step 3A: Audio Path — Convert to File & Transcribe (Whisper)

**What it does (only when user sends voice):**

1. **Convert to File**  
   The audio arrives as a long Base64 string. This node turns it into an actual audio file.

2. **HTTP Request (Whisper)**  
   The file is sent to a **Whisper** service (e.g. OpenAI Whisper API). Whisper listens to the audio and returns the spoken words as text.

3. **Edit Fields**  
   The transcribed text is formatted so it looks like a normal `message` — same shape as if the user had typed it.

**Example:**
```
User speaks: "What's the capital of France?"
     ↓ (Base64 audio sent)
Whisper returns: "What's the capital of France?"
     ↓ (Edit Fields formats it)
Result: { "message": "What's the capital of France?" }
```

**Why it matters:**  
The AI only understands text. Voice must become text before the AI can answer.

---

### Step 3B: Text Path — Edit Fields

**What it does (when user sends text):**  
No transcription is needed. This node just formats the `message` so it matches what the AI expects.

**Example:**
```
User types: "Explain quantum computing"
     ↓ (Edit Fields)
Result: { "message": "Explain quantum computing" }
```

**Why it matters:**  
Keeps the data structure consistent, whether the input was text or voice.

---

### Step 4: Payload — Prepare the Prompt

**What it does:**  
Both paths (audio and text) meet here. The Payload node builds the final packet that will be sent to the AI Agent. It includes:

- The user's message (or transcribed text)
- Conversation history (so the AI remembers context)
- Any other needed fields

**Example:**
```json
{
  "prompt": "What is the capital of France?",
  "context": [
    { "user": "Hi", "assistant": "Hello! How can I help?" }
  ]
}
```

**Why it matters:**  
The AI needs a clear, structured prompt. This node ensures everything is in the right format.

---

### Step 5: AI Agent — The Brain

**What it does:**  
This is where the magic happens. The AI Agent node:

1. **Receives the prompt** from the Payload node
2. **Uses the Mistral Cloud Chat Model** to generate a response
3. **Uses Memory** to remember the conversation (so it can say "you asked about X earlier")
4. **Can use Tools:**
   - **Think** — Helps the AI reason step by step for complex questions
   - **SerpAPI** — Lets the AI search Google for real-time info (weather, news, etc.)

**Example 1 — Simple question (no tools needed):**
```
User: "What is 2 + 2?"
AI: "2 + 2 equals 4."
```

**Example 2 — Needs real-time info (SerpAPI):**
```
User: "What's the weather in Paris today?"
AI uses SerpAPI → finds current weather → responds: "In Paris today it's 18°C and partly cloudy."
```

**Example 3 — Complex question (Think tool):**
```
User: "Explain how photosynthesis works step by step"
AI uses Think → reasons through the process → gives a clear explanation
```

**Why it matters:**  
This is the core of AstroBot. Mistral provides the intelligence; SerpAPI adds up-to-date search; Think helps with harder questions.

---

### Step 6: Edit Fields — Clean the Output

**What it does:**  
The AI Agent returns raw data. This node extracts the actual answer and formats it nicely before sending it back.

**Example:**
```
AI raw output: { "output": "The capital of France is Paris.", "metadata": {...} }
     ↓ (Edit Fields)
Clean output: { "response": "The capital of France is Paris." }
```

**Why it matters:**  
The frontend expects a simple `response` field. This node makes sure we send exactly that.

---

### Step 7: Respond to Webhook — Send Back to User

**What it does:**  
This is the last step. The node sends the answer back to the AstroBot backend, which then:

1. Saves the conversation to the database
2. Sends the response to the frontend
3. The user sees AstroBot's reply in the chat

**Example:**
```json
{
  "response": "The capital of France is Paris. It's known for the Eiffel Tower, Louvre Museum, and its rich history!"
}
```

**Why it matters:**  
Without this step, the user would never see the answer. This closes the loop from request → processing → response.

---

## Full Example: Voice Message Flow

Let's trace what happens when a user **records a voice message**:

1. **User:** Clicks mic, says *"What's the latest news about Mars?"*
2. **Frontend:** Records audio, converts to Base64, sends to backend
3. **Backend:** Calls n8n webhook with `audio: "base64encoded..."`, `message: "[Audio message]"`
4. **n8n Webhook:** Receives the request ✅
5. **Switch:** Sees `audio` has data → goes to **Audio path** ✅
6. **Convert to File:** Base64 → audio file ✅
7. **Whisper:** Transcribes → *"What's the latest news about Mars?"* ✅
8. **Edit Fields:** Formats as `{ message: "What's the latest news about Mars?" }` ✅
9. **Payload:** Prepares prompt with conversation context ✅
10. **AI Agent:** Uses Mistral + **SerpAPI** → searches for Mars news → generates answer ✅
11. **Edit Fields:** Extracts clean response ✅
12. **Respond to Webhook:** Sends answer back ✅
13. **Backend:** Saves to DB, sends to frontend ✅
14. **User:** Sees: *"Here's the latest on Mars: NASA's Perseverance rover recently..."* ✅

---

## Summary Table

| Step | Node | Input | Output |
|------|------|-------|--------|
| 1 | Webhook | HTTP POST from AstroBot | Raw message/audio data |
| 2 | Switch | Raw data | Routes to Audio or Text path |
| 3A | Convert + Whisper + Edit | Base64 audio | Transcribed text |
| 3B | Edit Fields | Text message | Formatted text |
| 4 | Payload | Text + history | Structured prompt |
| 5 | AI Agent | Prompt | Mistral response (with SerpAPI/Think if needed) |
| 6 | Edit Fields | Raw AI output | Clean `response` |
| 7 | Respond to Webhook | Clean response | HTTP response back to AstroBot |

---

## Technologies Used

| Tool | Role |
|------|------|
| **n8n** | Workflow orchestration — connects all the pieces |
| **Whisper** | Speech-to-text — turns voice into text |
| **Mistral** | Large language model — generates answers |
| **SerpAPI** | Google search — real-time info (weather, news, etc.) |
| **Think** | Reasoning tool — helps with complex questions |

---

## Need Help?

- **n8n docs:** [https://docs.n8n.io](https://docs.n8n.io)
- **Mistral AI:** [https://mistral.ai](https://mistral.ai)
- **Whisper (OpenAI):** [https://platform.openai.com/docs/guides/speech-to-text](https://platform.openai.com/docs/guides/speech-to-text)
- **SerpAPI:** [https://serpapi.com](https://serpapi.com)

---

**Built with 🚀 by Tidiane, Saad, Ahmed & Sidi**
