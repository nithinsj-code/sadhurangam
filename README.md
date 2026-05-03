# Sadhurangam: Tamil Version of Chess by Nithin

Sadhurangam is a premium, real-time multiplayer chess application built with a modern neumorphic design. It features low-latency gameplay, real-time move synchronization, and a beautiful user interface.

## 🚀 Features

- **Real-time Multiplayer**: Powered by Supabase Realtime for instant move synchronization.
- **Premium Neumorphic UI**: A modern, soft-depth aesthetic that feels tactile and high-end.
- **Custom Branding**: Personalized "Tamil Version of Chess by Nithin" experience.
- **Mobile Responsive**: Fully optimized for all screen sizes.
- **Secure Authentication**: User profiles and game data protected by Supabase Auth and RLS.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Lucide React
- **Backend/Database**: Supabase (PostgreSQL, Realtime, Auth)
- **Styling**: Vanilla CSS (Custom Neumorphic System)
- **Logic**: Chess.js, React-Chessboard

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- A Supabase account

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/sadhurangam.git
   cd sadhurangam
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   - Create a `.env` file in the root directory.
   - Use `.env.example` as a template and add your Supabase credentials.
   ```env
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Database Setup**:
   - Copy the contents of `supabase/schema.sql` and run it in the Supabase SQL Editor.

5. **Start the development server**:
   ```bash
   npm run dev
   ```

## 🌐 Deployment

This project is optimized for deployment on **Vercel**.

1. Push your code to GitHub.
2. Connect the repository to Vercel.
3. Add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables in the Vercel dashboard.
4. The `vercel.json` file handles routing for the SPA automatically.

## 📄 License

This project is open-source. Feel free to use and modify!
