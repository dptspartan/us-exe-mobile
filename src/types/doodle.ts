export type DoodlePoint = { x: number; y: number };

export type DoodleStroke = {
  id: string;
  authorId: string;
  color: string;
  width: number;
  points: DoodlePoint[];
  createdAt: string;
};

export type DoodleCanvasRow = {
  couple_id: string;
  strokes: DoodleStroke[];
  version: number;
  updated_at: string;
  updated_by: string | null;
};

export type DoodleBroadcastEvent =
  | { event: 'doodle_stroke'; stroke: DoodleStroke; final?: boolean }
  | { event: 'doodle_clear' }
  | { event: 'doodle_undo'; strokeId: string };

export type SavedDoodle = {
  id: string;
  imageUrl: string;
  caption: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  source_type: 'doodle';
};
