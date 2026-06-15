import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type SessionId = 'desk' | 'memories' | 'notes' | 'jam' | 'letter' | 'sparks';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type SessionTile = {
  id: SessionId;
  title: string;
  icon: IoniconName;
};

export const SESSION_TILES: SessionTile[] = [
  { id: 'desk', title: 'Desk', icon: 'grid-outline' },
  { id: 'memories', title: 'Wall', icon: 'images-outline' },
  { id: 'notes', title: 'Notes', icon: 'document-text-outline' },
  { id: 'jam', title: 'Jam', icon: 'radio-outline' },
  { id: 'letter', title: 'Letter', icon: 'mail-outline' },
  { id: 'sparks', title: 'Sparks', icon: 'sparkles-outline' },
];
