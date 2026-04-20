import { Component, OnInit, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet'; // 📼 BACK TO LEGACY LEAFLET

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly baseUrl = 'http://localhost:5000'; 
  
  private map: L.Map | undefined;
  private currentLocationMarker: any;
  private destMarker: L.Marker | undefined;
  
  public currentLat: string = '30.1798';
  public currentLng: string = '66.9750';
  public currentZoom: number = 14;
  public isOnline: boolean = true;
  public isSidebarOpen: boolean = true;
  public isStorageOpen: boolean = false;
  public searchQuery: string = '';
  public searchSuggestions: any[] = [];
  public currentLayerName: string = 'google-street';
  public downloadedRegions: any[] = [];
  public isCaching: boolean = false;
  public isAutoDiscover: boolean = false; // 📡 AUTO-DISCOVERY TOGGLE
  public isHarvesting: boolean = false; // 🏹 HARVESTING STATE

  public downloadStatus: any = { active: false, total: 0, completed: 0, city: '', paused: false, totalMb: 0, mb: 0 };
  public customModal = { show: false, title: '', body: '', isProvince: false, city: '', isAlreadyDone: false, isDelete: false };
  public downloadStats = { speed: '0 KB/s', eta: 'N/A', totalMb: '0.00' };
  private statsInterval: any;
  private areaHighlight: L.Rectangle | undefined;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    window.addEventListener('online', () => { 
        this.isOnline = true; 
        this.cdr.detectChanges(); 
    });
    window.addEventListener('offline', () => { 
        this.isOnline = false; 
        const savedLoc = localStorage.getItem('omega_last_loc');
        if (savedLoc && this.map) {
            const pos = JSON.parse(savedLoc);
            this.map.setView(pos, 16); // 🎯 FORCE ZOOM 16 ON OFFLINE (v71.0)
        } else {
            this.locateUser(); 
        }
        this.cdr.detectChanges(); 
    });
    this.isOnline = navigator.onLine;
    this.loadDownloadedRegions();
    this.startStatsPolling(); 
  }

  ngAfterViewInit(): void {
    this.initMap();
    // 🔒 OFFLINE BOOT LOCK (v69.0)
    // Only auto-locate if online. If offline, trust the localStorage set in initMap.
    if (this.isOnline) {
        setTimeout(() => { this.locateUser(); }, 500);
    }
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
  }

  private initMap(): void {
    const iconDefault = L.icon({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = iconDefault;

    // 💾 LOAD TOTAL PERSISTENCE (v70.0)
    const savedLoc = localStorage.getItem('omega_last_loc');
    const savedZoom = localStorage.getItem('omega_last_zoom');
    const startPos = savedLoc ? JSON.parse(savedLoc) : [30.1798, 66.9750];
    const startZoom = savedZoom ? parseInt(savedZoom) : 14;

    this.map = L.map('map-container', {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    }).setView(startPos, startZoom);

    this.switchLayer(this.currentLayerName);

    this.map.on('move', () => {
      this.zone.run(() => {
        if (this.map) {
          const center = this.map.getCenter();
          this.currentLat = center.lat.toFixed(4);
          this.currentLng = center.lng.toFixed(4);
          localStorage.setItem('omega_last_loc', JSON.stringify([center.lat, center.lng]));
          localStorage.setItem('omega_last_zoom', this.map.getZoom().toString());
          
          // 📡 AUTO-DISCOVERY TRIGGER (v74.1)
          if (this.isAutoDiscover) {
              this.triggerAutoDiscover(true);
          }
          
          this.cdr.markForCheck();
        }
      });
    });

    this.map.on('zoomend', () => {
      this.zone.run(() => { 
          if (this.map) { 
              this.currentZoom = this.map.getZoom(); 
              localStorage.setItem('omega_last_zoom', this.currentZoom.toString()); // Save Zoom on change
              this.cdr.markForCheck(); 
          } 
      });
    });

    // 🧹 AUTO-CLEAR OVERLAY ON MAP CLICK (v68.0)
    this.map.on('click', () => {
      this.zone.run(() => {
          if (this.areaHighlight && this.map) {
              this.map.removeLayer(this.areaHighlight);
              this.areaHighlight = undefined;
              this.cdr.detectChanges();
          }
      });
    });

    // 🎯 RESTORE UNIFIED BLUE DOT (v73.0)
    if (savedLoc) {
        const pos = JSON.parse(savedLoc);
        this.updateUserMarker(pos);
    }
  }

  private updateUserMarker(coords: L.LatLngExpression): void {
    if (!this.map) return;
    const blueDotIcon = L.divIcon({
      className: 'google-blue-dot-container',
      html: `<div class="google-blue-dot"><div class="google-blue-dot-pulse"></div></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    if (this.currentLocationMarker) {
        (this.currentLocationMarker as L.Marker).setLatLng(coords);
    } else {
        this.currentLocationMarker = L.marker(coords, { icon: blueDotIcon }).addTo(this.map);
    }
  }

  public switchLayer(layerName: string): void {
    if (!this.map) return;
    this.currentLayerName = layerName;
    this.map.eachLayer((l: any) => { if (l instanceof L.TileLayer) this.map?.removeLayer(l); });
    let sourceLayer = layerName;
    if (layerName === 'arcgis-dark') sourceLayer = 'google-street'; 

    const tileUrl = `${this.baseUrl}/tiles/${sourceLayer}/{z}/{x}/{y}.png`;
    L.tileLayer(tileUrl, {
      maxZoom: 22,
      maxNativeZoom: (layerName === 'arcgis-street' || layerName === 'google-street') ? 19 : 21,
      tileSize: 256
    }).addTo(this.map);
  }

  public toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 300);
  }

  public async performSearch(): Promise<void> {
    if (!this.searchQuery) return;
    try {
      const osmRes = await fetch(`${this.baseUrl}/api/search?q=${this.searchQuery}&countrycodes=pk,ir,af&limit=1`);
      const results = await osmRes.json();
      if (results.length > 0 && this.map) {
        this.map.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 16);
        this.searchSuggestions = [];
      }
    } catch (err) { console.error(err); }
  }

  public onSearchInput(): void {
    if (this.searchQuery.length < 3) { this.searchSuggestions = []; return; }
    fetch(`${this.baseUrl}/api/search?q=${this.searchQuery}&countrycodes=pk,ir,af&limit=5`)
      .then(res => res.json())
      .then(data => { this.searchSuggestions = data; })
      .catch(err => console.error(err));
  }

  public selectSuggestion(s: any): void {
    this.searchQuery = s.display_name;
    this.searchSuggestions = [];
    if (this.map) this.map.flyTo([parseFloat(s.lat), parseFloat(s.lon)], 16);
  }

  public locateUser(): void {
    if (navigator.geolocation && this.map) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        this.map?.flyTo(coords, 16);
        this.updateUserMarker(coords); // 🎯 UNIFIED UPDATE (v73.0)
      });
    }
  }

  public loadDownloadedRegions(): void {
    // 🛡️ CACHE-BUSTER (v92.0): Force browser to fetch Atomic Data every time
    fetch(`${this.baseUrl}/all-downloads?t=${Date.now()}`).then(r => r.json()).then(d => {
        this.downloadedRegions = d;
        this.cdr.detectChanges(); // 🔥 FORCE LIVE UPDATE IN STORAGE MANAGER
    });
  }

  public toggleStorage(): void { this.isStorageOpen = !this.isStorageOpen; }
  public closeModal(): void { this.customModal.show = false; }
  public formatBytes(bytes: any): string { 
    const val = parseFloat(bytes);
    if (isNaN(val)) return '0.00 MB';
    if (val > 1024) return (val / 1024).toFixed(2) + ' GB';
    return val.toFixed(2) + ' MB'; 
  }
  public viewArea(reg: any): void {
      if(!this.map) return;
      
      // 🚩 NAYI DOWNLOADS KI LOGIC (WITH BBOX)
      if (reg.bbox) {
          const bbox = JSON.parse(reg.bbox);
          const bounds: L.LatLngBoundsExpression = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
          
          if (this.areaHighlight) this.map.removeLayer(this.areaHighlight);
          this.areaHighlight = L.rectangle(bounds, {
              color: "#1a73e8", weight: 2, fillColor: "#1a73e8", fillOpacity: 0.15, dashArray: '5, 5'
          }).addTo(this.map);

          this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else {
          // 🏛️ PURANI DOWNLOADS (FALLBACK FLY)
          alert('Overlay only available for NEW harvests. Flying to default city view.');
          this.map.flyTo([30.1798, 66.9750], 12);
      }
      this.toggleStorage();
  }
  public shareLocation(): void { alert('Location: ' + this.currentLat + ', ' + this.currentLng); }
  public downloadCurrentArea(): void { this.showDownloadModal('Current View', false); }

  public toggleLayer(): void {
    const layers = ['google-street', 'satellite', 'arcgis-street', 'arcgis-dark'];
    const idx = layers.indexOf(this.currentLayerName);
    this.switchLayer(layers[(idx + 1) % layers.length]);
  }

  // 🛑 UNIVERSAL STOP BUTTON LOGIC (v105)
  public stopDownload(): void {
    fetch(`${this.baseUrl}/stop-download`, { method: 'POST' }).then(() => {
      this.downloadStatus.active = false;
      this.isAutoDiscover = false; // Turn OFF pulse
      this.isHarvesting = false; // Turn OFF harvesting
      this.loadDownloadedRegions();
    });
  }

  public get currentPreviewImage(): string {
    return `https://mt1.google.com/vt/lyrs=m&x=11240&y=6749&z=14`;
  }

  public get isSatellite(): boolean { return this.currentLayerName === 'satellite'; }

  public showDownloadModal(area: string, isAll: boolean): void {
    this.customModal = { show: true, title: 'Download', body: `Harvest ${area}?`, isProvince: isAll, city: area, isAlreadyDone: false, isDelete: false };
  }
  public showProvinceSelector(): void {
    this.customModal = { show: true, title: 'Select Region', body: 'Choose a province:', isProvince: true, city: 'Punjab', isAlreadyDone: false, isDelete: false };
  }
  public startOfflineHarvest(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    let bbox: any;
    
    // 🌍 AREA vs CITY LOGIC (v63.0)
    if (this.customModal.city === 'Current View') {
        // Precise Viewport Capture
        const bounds = this.map.getBounds();
        bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    } else {
        // Full City Metropolitan Scope (0.15 Radius)
        const radius = 0.15; 
        bbox = [center.lng - radius, center.lat - radius, center.lng + radius, center.lat + radius];
    }

    fetch(`${this.baseUrl}/start-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            city: this.customModal.city, 
            bbox: bbox,
            zoomMin: 0, 
            zoomMax: 21 
        })
    }).then(() => {
        this.closeModal();
        this.startStatsPolling();
    });
  }

  private startStatsPolling(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(() => {
      // ⚡ SYNC INVENTORY
      this.loadDownloadedRegions();

      fetch(`${this.baseUrl}/download-status?t=${Date.now()}`).then(r => r.json()).then(status => {
          if (status.active) {
              // 🏙️ MANUAL PRIORITY
              this.downloadStatus = { 
                  active: true, 
                  city: status.city, 
                  completed: status.completed, 
                  total: status.total, 
                  mb: status.mb, 
                  totalMb: status.totalMb 
              };
          } else {
              // 📡 AUTO-DISCOVERY FALLBACK (v103.1 Refresh)
              const auto = this.downloadedRegions.find(r => r.city === 'Auto-Discovered Data');
              if (auto && (auto.status.includes('Capturing') || auto.status.includes('Harvesting') || auto.status.includes('Planning'))) {
                  this.downloadStatus = {
                      active: true,
                      city: '🛰️ ' + auto.city,
                      completed: auto.completed_tiles || 0,
                      total: auto.total_tiles || 0,
                      mb: parseFloat(auto.size_mb || 0).toFixed(2),
                      totalMb: ((auto.total_tiles || 0) * 0.006).toFixed(2)
                  };
              } else {
                  this.downloadStatus.active = false;
              }
          }
          this.cdr.detectChanges();
      });
    }, 1000);
  }

  public pauseDownload(): void { fetch(`${this.baseUrl}/pause-download`, { method: 'POST' }); }
  public resumeDownload(): void { fetch(`${this.baseUrl}/resume-download`, { method: 'POST' }); }
  public showDeleteModal(city: string): void { this.customModal = { show: true, title: 'Delete', body: `Delete ${city}?`, isProvince: false, city, isAlreadyDone: false, isDelete: true }; }
  public confirmDelete(): void {
     fetch(`${this.baseUrl}/delete-download`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ city: this.customModal.city })
     }).then(() => {
         this.closeModal();
         this.loadDownloadedRegions();
         this.cdr.detectChanges();
     });
  }

  public confirmDeleteAll(): void {
      if (!confirm("☢️ NUCLEAR RESET: This will permanently delete ALL offline maps and FREE UP Disk Space. Procceed?")) return;
      
      this.isCaching = true; // Show loading state
      fetch(`${this.baseUrl}/delete-all-data`, { method: 'POST' })
          .then(() => {
              this.isCaching = false;
              this.loadDownloadedRegions();
              alert("✅ DISK PURGED: System is now 100% Clean Slate.");
              this.cdr.detectChanges();
          });
  }

  // 🏹 TOGGLE: ON = Planning (silent), OFF = Start Harvesting
  public toggleAutoDiscover(): void {
    this.isAutoDiscover = !this.isAutoDiscover;
    if (!this.isAutoDiscover) {
      // User toggled OFF → Start Harvesting immediately
      this.isHarvesting = true;
      if (!this.map) return;
      const bounds = this.map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      fetch(`${this.baseUrl}/auto-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bbox, enabled: false }) // enabled:false = HARVEST NOW
      }).then(() => this.loadDownloadedRegions());
    } else {
      this.isHarvesting = false;
    }
    this.cdr.detectChanges();
  }

  private lastAutoSave: number = 0;
  private triggerAutoDiscover(isEnabled: boolean): void {
    const now = Date.now();
    if (now - this.lastAutoSave < 3000) return; // 🕒 Throttle: 3s while planning
    this.lastAutoSave = now;

    if (!this.map) return;
    const bounds = this.map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];

    fetch(`${this.baseUrl}/auto-discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox, enabled: true }) // enabled:true = PLANNING only
    }).then(() => this.loadDownloadedRegions());
  }
}
