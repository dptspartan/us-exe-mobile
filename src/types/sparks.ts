export type SparkType = 'buzz' | 'love_you' | 'need_hugs' | 'hug_returned';

export type SparkRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  type: SparkType;
  created_at: string;
  expires_at: string | null;
  resolved: boolean;
};

export const SPARK_DEEP_LINK_SCREEN = 'sparks' as const;
