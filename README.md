Offline Map System – Setup Guide
🛠️ Prerequisites

Before starting, please make sure you have:

Node.js (v18 or higher) installed
👉 Download: https://nodejs.org/
🚀 Step 1: Start the Backend (Map Server)

The backend is responsible for serving map data and handling offline storage.

Follow these steps:
Open Command Prompt / Terminal
Go to the backend folder:
cd backend
Install required packages (first time only):
npm install
Start the server:
node server.js

✔ After running, the server will start on:
👉 http://localhost:5000

⚠️ Keep this terminal open — do not close it.

🗺️ Step 2: Start the Frontend (Map Interface)

This is the user interface where you will see and interact with the map.

Follow these steps:
Open a new terminal window

Go to the frontend folder:

cd frontend
Install dependencies (first time only):
npm install

Start the application:
npm start

Open your browser and go to:
👉 http://localhost:4200
💡 How to Use the System

📍 Explore Map
Move around the map (zoom and pan)
The system will automatically load map data

💾 Offline Data Storage
As you explore, the system saves map data locally
You can use it later without internet

🧭 Location Feature
Click “Locate Me” to find your current position
⚠️ If it doesn’t work, please allow location permission in your browser

🗂️ Storage Management
You can view downloaded map data
Option available to clear storage if needed

⚠️ Important Notes
Backend (server.js) must always be running
First-time loading may take a few seconds
Zoom levels above 21 depend on available data
System works both online and offline

✅ System Features
✔ Smooth map navigation
✔ Offline map support
✔ Automatic data download
✔ Reliable storage system
✔ Zoom support up to 21 (based on available data)

🧠 Final Note

This system is designed to provide a Google Maps-like experience, with the added benefit of offline functionality and data control.