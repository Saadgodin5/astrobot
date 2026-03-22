# AstroBot — Your Intelligent Space Assistant

AstroBot is an AI-powered chat assistant with a space-themed UI. Users can register, login, chat with an AI (via n8n webhooks), and optionally generate images using Hugging Face's Stable Diffusion. All conversations are stored in PostgreSQL.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Frontend](#frontend)
- [Backend](#backend)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Docker Deployment](#docker-deployment)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [License](#license)

---

## Overview

AstroBot provides:

- **User authentication** — Register, login, profile management, password change
- **AI chat** — Send text or voice messages; get AI responses via n8n webhook
- **Conversation history** — View, load, and delete past chats
- **Image generation** — Ask the AI to generate images; rendered via Hugging Face API
- **Space-themed UI** — Starfield backgrounds, animated robot, responsive design

---

## Project Structure

```
astrobot/
├── frontend/           # Static HTML/CSS/JS
│   ├── index.html      # Landing page
│   ├── login.html      # Login form
│   ├── register.html   # Registration form
│   ├── chat.html       # Chat interface (main app)
│   └── style.css       # Shared styles
├── backend/            # Node.js Express API
│   ├── server.js       # Entry point
│   ├── db/             # PostgreSQL connection & init
│   ├── routes/         # Auth & chat routes
│   └── middleware/     # JWT auth middleware
├── docker/             # Docker config
│   ├── Dockerfile
│   └── docker-compose.yml
├── requirements.txt    # Python deps (deploy script)
└── README.md
```

---

## Frontend

### Technologies Used

| Technology | Purpose |
|------------|---------|
| **HTML5** | Semantic structure, forms, accessibility (ARIA labels, roles) |
| **CSS3** | Layout, animations, glassmorphism, starfield, responsive design |
| **Vanilla JavaScript** | No frameworks; fetch API, localStorage, MediaRecorder for audio |
| **Google Fonts** | Orbitron (headings), Inter, Exo 2 (body) |

### Frontend Pages

1. **`index.html`** — Landing page
   - Hero section with animated robot
   - Feature cards (Instant Responses, Secure & Private, Space-grade AI, Full History)
   - Navigation to Login / Get Started

2. **`login.html`** — Login form
   - Email & password
   - Client-side validation
   - JWT stored in `localStorage`

3. **`register.html`** — Registration form
   - Name, surname, email, password
   - Password confirmation

4. **`chat.html`** — Main chat application
   - Sidebar: user info, settings, history, logout
   - Chat area: messages, typing indicator, quick prompts
   - Input: text (Enter to send) + microphone for voice
   - Modals: logout confirmation, settings (profile, password)

### Frontend Features

- **Starfield background** — CSS starfield with twinkle animation
- **Animated robot** — SVG robot with click “takeoff” animation
- **Shooting stars** — Optional decorative effect on chat page
- **Audio recording** — Browser MediaRecorder API to send voice messages
- **Responsive layout** — Works on mobile and desktop

---

## Backend

### Technologies Used

| Package | Purpose |
|---------|---------|
| **Express** | HTTP server, routing, middleware |
| **CORS** | Cross-origin requests from frontend |
| **Helmet** | Security headers |
| **express-rate-limit** | Rate limiting (auth, chat, global) |
| **bcryptjs** | Password hashing |
| **jsonwebtoken** | JWT auth tokens |
| **pg** | PostgreSQL client |
| **dotenv** | Environment variables |

### Backend Architecture

```
server.js
├── Security: Helmet, CORS, rate limiting
├── Static files: frontend/ (dev) or public/ (prod)
├── /api/auth     → auth routes (register, login, profile, password)
├── /api/chat     → chat routes (message, history, delete)
├── /api/health   → health check
└── DB init       → create users & conversations tables
```

### Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| PUT | `/api/auth/profile` | Update name/surname (auth required) |
| PUT | `/api/auth/password` | Change password (auth required) |
| POST | `/api/chat/message` | Send message, get AI response (auth required) |
| GET | `/api/chat/history` | Get conversation history (auth required) |
| DELETE | `/api/chat/:id` | Delete a conversation (auth required) |
| GET | `/api/health` | Health check |

---

## How It Works

### 1. Authentication Flow

```
User → Register/Login → Backend validates → JWT issued → Stored in localStorage
→ Subsequent requests include: Authorization: Bearer <token>
```

### 2. Chat Flow

```
User types message → POST /api/chat/message
→ Backend fetches last 15 messages for context
→ Backend calls n8n webhook with message + history
→ n8n (with AI) returns response
→ Backend optionally calls Hugging Face for image generation
→ Response + optional image saved to DB
→ Response returned to frontend
```

### 3. n8n Integration

The backend sends user messages to an n8n webhook (`N8N_WEBHOOK` env var). The webhook can:

- Process text with an AI model (OpenAI, etc.)
- Transcribe audio
- Return a text response or JSON with `action: "generate_image"` and `image_prompt` for image generation

### 4. Image Generation

If the AI returns JSON like:

```json
{
  "action": "generate_image",
  "image_prompt": "A robot in space",
  "response": "Here's your image!"
}
```

The backend calls Hugging Face’s Stable Diffusion XL API and returns the image as base64 in the response.

### 5. Database Schema

**users**

- `id`, `name`, `surname`, `email`, `password_hash`, `created_at`

**conversations**

- `id`, `user_id`, `message`, `response`, `created_at`

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- (Optional) n8n for AI chat
- (Optional) Hugging Face API key for image generation

### Install Dependencies

```bash
# Backend
cd backend && npm install

# Python (for deploy script)
pip install -r requirements.txt
```

### Configure Environment

Create `backend/.env`:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_secret_here

DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=your_user
DB_PASSWORD=your_password

# Optional
N8N_WEBHOOK=http://localhost:5678/webhook/astrobot
HF_API_KEY=your_huggingface_key
```

### Create Database

```sql
CREATE DATABASE mydatabase;
```

### Run

```bash
cd backend && node server.js
```

Then open `http://localhost:3000` in your browser.

---

## Deployment Script

A Python script (`deploy_frontend.example.py`) is provided for deploying frontend files via SFTP and rebuilding the Docker container on a remote server. It uses `paramiko` for SSH/SFTP.

```bash
cp deploy_frontend.example.py deploy_frontend.py
# Edit deploy_frontend.py with your server details
pip install paramiko
python deploy_frontend.py
```

> **Note:** `deploy_frontend.py` is in `.gitignore` so credentials are not committed.

---

## Docker Deployment

The project includes a Docker setup that:

1. Builds a Node.js image with backend + frontend
2. Connects to an external PostgreSQL container (e.g. from n8n)
3. Uses the `n8n_container_n8n-net` network

```bash
cd docker
docker-compose up -d
```

Ensure the `n8n_container_n8n-net` network exists and PostgreSQL is reachable at `postgre_container`.

---

## API Reference

### POST /api/auth/register

**Body:** `{ name, surname, email, password }`

**Response:** `{ success, token, user }`

### POST /api/auth/login

**Body:** `{ email, password }`

**Response:** `{ success, token, user }`

### POST /api/chat/message

**Headers:** `Authorization: Bearer <token>`

**Body:** `{ message, session_id?, audio? }`

**Response:** `{ success, data: { id, message, response, image_url?, createdAt } }`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 3000 | Server port |
| NODE_ENV | No | development | `development` or `production` |
| JWT_SECRET | Yes | — | Secret for JWT signing |
| DB_HOST | Yes | — | PostgreSQL host |
| DB_PORT | No | 5432 | PostgreSQL port |
| DB_NAME | Yes | — | Database name |
| DB_USER | Yes | — | Database user |
| DB_PASSWORD | Yes | — | Database password |
| N8N_WEBHOOK | No | — | n8n webhook URL for chat |
| HF_API_KEY | No | — | Hugging Face API key for images |

---

## License

MIT

---

**Built with 🚀 by Tidiane Konaté**
