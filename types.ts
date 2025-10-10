export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
}

export enum RideStatus {
  IDLE = 'IDLE',
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  PICKING_UP = 'PICKING_UP',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum VehicleType {
    NORMAL_CAR = 'NORMAL_CAR',
    AC_CAR = 'AC_CAR',
    PUBLIC_CAR = 'PUBLIC_CAR',
    VIP = 'VIP',
    MICROBUS = 'MICROBUS',
    MOTORCYCLE = 'MOTORCYCLE',
}

export enum SyrianProvinces {
  DAMASCUS = 'Damascus',
  RIF_DIMASHQ = 'Rif Dimashq',
  QUNEITRA = 'Quneitra',
  DARAA = 'Daraa',
  SUWAYDA = 'Al-Suwayda',
  HOMS = 'Homs',
  TARTUS = 'Tartus',
  LATAKIA = 'Latakia',
  HAMA = 'Hama',
  IDLIB = 'Idlib',
  ALEPPO = 'Aleppo',
  RAQQA = 'Raqqa',
  DEIR_EZ_ZOR = 'Deir ez-Zor',
  AL_HASAKAH = 'Al-Hasakah',
}

export interface User {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  province?: SyrianProvinces;
}

export interface Driver extends User {
  vehicle: {
    model: string;
    plateNumber: string;
    type: VehicleType;
  };
  rating: number;
  isOnline: boolean;
}

export interface Customer extends User {}

export interface Ride {
  id: string;
  customerId: string;
  driverId?: string;
  startLocation: { lat: number; lng: number; name: string };
  endLocation: { lat: number; lng: number; name: string };
  status: RideStatus;
  vehicleType: VehicleType;
  estimatedFare: number;
  finalFare?: number;
  distance: number; // in km
  duration: number; // in minutes
  polyline: [number, number][];
  createdAt: string;
  completedAt?: string;
  isScheduled: boolean;
  scheduledTime?: string;
}

export interface VehiclePricing {
    baseFare: number;
    perKm: number;
    perMinute: number;
}

export type PricingSettings = {
    [key in VehicleType]: VehiclePricing;
};

export interface Step {
    distance: number;
    duration: number;
    type: number;
    instruction: string;
    name: string;
    way_points: [number, number];
}

export interface RouteInfo {
  distance: number; // in km
  duration: number; // in minutes
  polyline: [number, number][];
  steps?: Step[];
}

export interface LocationSuggestion {
    name: string;
    coordinates: {
        lat: number;
        lng: number;
    };
}

export interface DriverPayment {
    id: string;
    driverId: string;
    amount: number;
    date: string; // ISO String
}