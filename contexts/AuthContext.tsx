import React, { createContext, useState, useContext, ReactNode } from 'react';
import { User, UserRole, SyrianProvinces, Driver, VehicleType, DriverStatus } from '../types';

interface AuthContextType {
  user: User | null;
  login: (details: { phone: string; password?: string; }) => Promise<User | null>;
  signup: (details: { name: string; phone: string; password?: string; role: UserRole; province?: SyrianProvinces; vehicle?: { model: string; plateNumber: string; type: VehicleType; } }) => Promise<User | null>;
  logout: () => void;
  verifyAndLogin: (phone: string, code: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Expanded mock users with passwords, status, and performance data
export const mockUsers: { [phone: string]: User } = {
    // Customers
    '0912345678': { id: 'cust1', phone: '0912345678', name: 'علي الزبون', password: '123', role: UserRole.CUSTOMER, province: SyrianProvinces.DAMASCUS },
    '0911111111': { id: 'cust2', phone: '0911111111', name: 'فاطمة العلي', password: '123', role: UserRole.CUSTOMER, province: SyrianProvinces.ALEPPO },

    // Drivers
    '0987654321': { id: 'driv1', phone: '0987654321', name: 'سامر السائق', password: '123', role: UserRole.DRIVER, province: SyrianProvinces.DAMASCUS, vehicle: { model: 'Kia Rio', plateNumber: '321789', type: VehicleType.AC_CAR }, rating: 4.8, isOnline: true, status: DriverStatus.APPROVED, isVerified: true, isBlocked: false, performance: { totalRides: 152, averageRating: 4.8, totalEarnings: 1850000, weeklyRides: [15, 14, 8, 10, 12, 18, 5] } } as Driver,
    '0988888888': { id: 'driv2', phone: '0988888888', name: 'خالد المصري', password: '123', role: UserRole.DRIVER, province: SyrianProvinces.DAMASCUS, vehicle: { model: 'Mercedes S-Class', plateNumber: '123123', type: VehicleType.VIP }, rating: 4.9, isOnline: true, status: DriverStatus.APPROVED, isVerified: true, isBlocked: false, performance: { totalRides: 45, averageRating: 4.9, totalEarnings: 2500000, weeklyRides: [2, 3, 1, 4, 3, 5, 4] } } as Driver,
    '0977777777': { id: 'driv3', phone: '0977777777', name: 'لينا الحسن', password: '123', role: UserRole.DRIVER, province: SyrianProvinces.ALEPPO, vehicle: { model: 'Toyota Corolla', plateNumber: '987654', type: VehicleType.NORMAL_CAR }, rating: 4.6, isOnline: false, status: DriverStatus.APPROVED, isVerified: true, isBlocked: true, performance: { totalRides: 98, averageRating: 4.6, totalEarnings: 1200000, weeklyRides: [8, 9, 11, 7, 10, 13, 10] } } as Driver,
    '0966666666': { id: 'driv4', phone: '0966666666', name: 'حسن دراج', password: '123', role: UserRole.DRIVER, province: SyrianProvinces.HOMS, vehicle: { model: 'Vespa', plateNumber: '555444', type: VehicleType.MOTORCYCLE }, rating: 4.7, isOnline: true, status: DriverStatus.APPROVED, isVerified: true, isBlocked: false, performance: { totalRides: 210, averageRating: 4.7, totalEarnings: 950000, weeklyRides: [20, 25, 22, 18, 24, 28, 21] } } as Driver,

    // Admin
    '0999999999': { id: 'admin1', phone: '0999999999', name: 'المدير العام', password: 'admin123', role: UserRole.ADMIN },
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (details: { phone: string, password?: string }): Promise<User | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const existingUser = mockUsers[details.phone];
    
    if (existingUser && existingUser.password === details.password) {
        if (existingUser.role === UserRole.DRIVER) {
            const driver = existingUser as Driver;
            if (driver.status !== DriverStatus.APPROVED || driver.isBlocked) {
                return null; // Login fails if not approved or is blocked
            }
            if (!driver.isVerified) {
                return null; // Login fails if approved but not verified, handled in LoginPage
            }
        }
        setUser(existingUser);
        return existingUser;
    }
    
    return null;
  };

  const signup = async (details: { name: string, phone: string, password?: string, role: UserRole, province?: SyrianProvinces, vehicle?: { model: string; plateNumber: string; type: VehicleType; } }): Promise<User | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (mockUsers[details.phone]) {
        // User with this phone number already exists
        return null; 
    }

    const newUser: User = {
        id: `user_${Date.now()}`,
        phone: details.phone,
        name: details.name,
        password: details.password,
        role: details.role,
        province: details.province
    };

    if (details.role === UserRole.DRIVER) {
        const driverDetails = newUser as Driver;
        driverDetails.vehicle = details.vehicle || { model: 'Default Car', plateNumber: '123456', type: VehicleType.NORMAL_CAR };
        driverDetails.rating = 0;
        driverDetails.isOnline = false;
        driverDetails.status = DriverStatus.PENDING; // New drivers are pending approval
        driverDetails.isVerified = false;
        driverDetails.verificationCode = undefined;
        driverDetails.isBlocked = false;
        driverDetails.performance = { totalRides: 0, averageRating: 0, totalEarnings: 0, weeklyRides: [0, 0, 0, 0, 0, 0, 0] };
    }

    mockUsers[details.phone] = newUser;
    // Don't log in the new driver automatically
    if (newUser.role !== UserRole.DRIVER) {
        setUser(newUser);
    }
    return newUser;
  };


  const logout = () => {
    setUser(null);
  };
  
  const verifyAndLogin = async (phone: string, code: string): Promise<User | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const userToVerify = mockUsers[phone];
    if (userToVerify && userToVerify.role === UserRole.DRIVER) {
        const driver = userToVerify as Driver;
        if (driver.verificationCode === code) {
            // Code is correct. Verify and log in.
            driver.isVerified = true;
            driver.verificationCode = undefined; // Security: one-time use
            setUser(driver);
            return driver;
        }
    }
    // Code is incorrect or user not found
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, verifyAndLogin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};