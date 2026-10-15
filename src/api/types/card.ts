export interface Card {
  id: number;
  cardCode: string;
  status: 'available' | 'issued' | 'lost';
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCardRequest {
  cardCode: string;
}

export interface CardResponse {
  id: number;
  cardCode: string;
  status: string;
  note?: string;
  createdAt: string;
}