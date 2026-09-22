/**
 * 백엔드 DB 스키마와 짝을 이루는 공용 타입 정의.
 * 화면 여러 곳에서 같은 구조를 주고받으므로 여기 한 곳에서만 정의한다.
 */
export type DeviceStatus = "normal" | "warning" | "error" | "fire" | "offline" | "maintenance" | "obstacle";

// ─── DB Entity Types ──────────────────────────────────────────────────────────

export interface Building {
  building_id: number;
  building_name: string;
}

export interface Floor {
  floor_id: number;
  building_id: number;
  level: number;
  floor_name: string;
  floor_label?: string;
  image_key?: string;
  image_ratio?: number;
}

export interface Zone {
  zone_id: number;
  floor_id: number;
  zone_name: string;
}

export interface MapNode {
  floor_node_id: number;
  floor_id: number;
  zone_id?: number | null;
  x: number;
  y: number;
  node_type: 'normal' | 'exit';
  is_blocked: boolean;
}

export interface ExtinguisherModel {
  model_id: number;
  model_name: string;
  total_weight: number;
  empty_weight: number;
  agent_type: string;
}

export type AdminRole = "admin" | "manager" | "operator" | "viewer";

export interface Admin {
  admin_id: number;
  admin_name: string;
  email: string;
  role: AdminRole;
  phone_number?: string;
  assigned_floor_id?: number;
  assigned_floor_name?: string;
  created_at: string;
  last_login?: string;
}

export interface SensorReading {
  sensor_type_name: string;
  value: number;
  unit: string;
}

export interface MaintenanceLog {
  maintenance_id: number;
  extinguisher_id: number;
  admin_id: number;
  admin_name: string;
  action_taken: string;
  created_at: string;
}

export interface VisionAnalysisLog {
  vision_log_id: number;
  snapshot_url: string;
  detected_class: string;
  confidence_score: number;
  model_version: string;
  created_at: string;
}

// ─── Enriched UI View (joins all related tables) ─────────────────────────────

export interface ExtinguisherView {
  extinguisher_id: number;
  id: string;                    // display string, e.g. "FE-101"

  // extinguishers table
  mac_address: string;
  ip_address: string;
  battery_level: number;         // 0–100
  last_ping_at: string;          // ISO datetime
  manufacture_date?: string;     // "YYYY-MM-DD"
  install_date: string;          // "YYYY-MM-DD"
  expiry_date: string;           // "YYYY-MM-DD"

  // extinguisher_status (joined)
  status: DeviceStatus;
  status_name: string;

  // extinguisher_models (joined)
  model_id: number;
  model_name: string;
  agent_type: string;
  total_weight: number;
  empty_weight: number;

  // map_nodes → zones → floors → buildings (joined)
  node_id: number;
  x_coord: number;
  y_coord: number;
  zone_id: number;
  zone_name: string;
  floor_id: number;
  floor_name: string;
  level: number;
  building_id: number;
  building_name: string;

  // admins (optional, joined)
  admin_id?: number;
  admin_name?: string;
  admin_phone?: string;

  // sensor_data (latest readings per sensor type)
  sensor_readings: SensorReading[];

  // maintenance_logs
  maintenance_logs: MaintenanceLog[];

  // vision_analysis_logs (latest)
  latest_vision?: VisionAnalysisLog;
}

export type Device = ExtinguisherView;
