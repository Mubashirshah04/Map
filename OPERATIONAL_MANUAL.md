# 💎 OMEGA GIS ENGINE - COMPLETE OPERATIONAL MANUAL (v110.
---

## 🚀 1. Core Features Overview

### 🌍 Multi-Country Support
The engine is pre-configured with high-precision bounding boxes for three major regions:
- **Pakistan:** Full strategic coverage (Lon: 60.8 - 77.9, Lat: 23.6 - 37.1).
- **Iran:** Complete regional scope (Lon: 44.0 - 63.5, Lat: 24.0 - 40.0).
- **Afghanistan:** Full territory capture (Lon: 60.0 - 29.3, Lat: 74.9 - 38.5).

### 🛰️ Quad-Layer Deep Sync
Every download mission targets 4 high-definition mapping layers simultaneously:
1. **Google Streets:** Standard administrative and logistical mapping.
2. **Google Satellite:** High-resolution orbital imagery (up to Z21).
3. **ArcGIS Streets:** Topographic and terrain-focused data.
4. **ArcGIS Satellite:** Professional-grade alternate imagery.
*(Note: Night Mode is generated dynamically from Google Streets to save disk space).*

### 🔍 Search API
A fully integrated, live-proxy Search API allows users to find cities, streets, and landmarks globally, with focused accuracy within the supported region.

---

## 🕹️ 2. User Interface Guide

### 📍 The Control Sidebar
- **Download Area (Z21):** Instantly targets the current map viewport for an HD harvest.
- **Region Download:** Allows selection of specific provinces (e.g., Punjab, Sindh, Balochistan).
- **Full Country Buttons (PK/IR/AF):** Starts a total regional harvest with pre-calculated storage budgets.
- **Auto-Discovery Toggle:** 
    - **ON (Planning):** Records your browsing path and "plans" a mission.
    - **OFF (Harvesting):** Automatically starts downloading all tiles within the planned path.

### 🏙️ OMEGA Floating HUD
Located at the center-bottom (Desktop) or top (Mobile), this persistent HUD shows:
- Active city/mission name.
- Real-time download size (MB/GB) and Tile count.
- **🗑️ Delete Button:** Aborts the mission and allows for instant data purging via a confirmation dialog.

### 🔘 Layer Hub (Side Pill)
A sleek, transparent pill on the right side for instant switching between Street, Satellite, ArcGIS, and Night modes.

---

## 🧪 3. How to Test (Quality Assurance)

### Test A: HD Offline Verification
1. Open the sidebar and click **"Download Area (Z21)"**.
2. Watch the **OMEGA HUD** appear. Wait for it to reach 100% or "Completed".
3. **Turn OFF your internet connection.**
4. Zoom in to Level 21 (House/Street level) in that specific area.
5. **Result:** The map must remain crystal clear and high-definition without internet.

### Test B: Stability Under Load
1. Click **"Full Pakistan (Z21)"**.
2. Observe the HUD showing billions of tiles as the target.
3. Open **Task Manager** on your computer.
4. **Result:** The server will utilize CPU/Network but will **NEVER CRASH**, thanks to the *Stability Kernel (v110)* which yields event loops every 500 tiles.

### Test C: Cross-Layer Sync
1. Start a download for any city.
2. While downloading, switch between **Satellite** and **Street** using the Layer Hub.
3. **Result:** Both layers should show progress in the HUD, as the engine harvests all 4 layers simultaneously.

---

## ☢️ 4. Storage Management & Nuclear Reset

### Inventory List
The **Inventory** modal shows your offline libraries. You can:
- **View:** Jump the map directly to a saved region.
- **Delete:** Remove a specific city's footprint.

### Nuclear Reset (Emergency Purge)
The red **☢️ Reset Engine** button allows for a 100% physical disk reclamation. 
- **Action:** Deletes `tiles.db`, clears cache, and restarts the engine as a clean slate.
- **Warning:** This cannot be undone.

---

## 📡 5. Technical Specifications
- **Backend Port:** 5000 (Open `http://localhost:5000` to verify).
- **Frontend Port:** 4200 (Angular Development Server).
- **Database:** SQLite (WAL Mode enabled for high-concurrency writes).
- **Tile Server API:** `http://localhost:5000/tiles/{layer}/{z}/{x}/{y}.png`.

---
*Created by OMEGA GIS Solutions (v110.0 Professional Build)*
