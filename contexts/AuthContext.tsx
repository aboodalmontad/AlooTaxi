import React, { createContext, useState, useContext, ReactNode } from 'react';
import { User, UserRole, SyrianProvinces, Driver, VehicleType } from '../types';

interface AuthContextType {
  user: User | null;
  login: (details: { name: string; phone: string; role: UserRole; province?: SyrianProvinces; }) => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock Users based on phone number
const mockUsers: { [phone: string]: User } = {
    '0912345678': { id: 'cust1', phone: '0912345678', name: 'علي الزبون', role: UserRole.CUSTOMER, province: SyrianProvinces.DAMASCUS },
    '0987654321': { id: 'driv1', phone: '0987654321', name: 'سامر السائق', role: UserRole.DRIVER, province: SyrianProvinces.ALEPPO, vehicle: { model: 'Kia Rio', plateNumber: '321789', type: VehicleType.AC_CAR }, rating: 4.8, isOnline: true } as Driver,
    '0999999999': { id: 'admin1', phone: '0999999999', name: 'المدير العام', role: UserRole.ADMIN },
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (details: { name: string, phone: string, role: UserRole, province?: SyrianProvinces }): Promise<User | null> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ADMIN LOGIN: Special case, handled first for security and clarity.
    if (details.role === UserRole.ADMIN) {
        if (details.phone === '0999999999' && details.name === 'admin123') {
            // On successful admin login, create the user object directly.
            // This makes the admin login self-contained and not dependent on the mockUsers object state.
            const adminUser: User = { 
                id: 'admin1', 
                phone: '0999999999', 
                name: 'المدير العام', 
                role: UserRole.ADMIN 
            };
            setUser(adminUser);
            return adminUser;
        } else {
            return null; // Invalid admin credentials
        }
    }

    // CUSTOMER & DRIVER LOGIN / SIGNUP
    const existingUser = mockUsers[details.phone];

    if (existingUser) {
        // User exists: LOGIN attempt.
        if (existingUser.role === details.role) {
            setUser(existingUser);
            return existingUser; // Successful login
        } else {
            // Phone number exists but with a different role.
            return null; 
        }
    } else {
        // User does not exist: SIGNUP attempt.
        const newUser: User = {
            id: `user_${Date.now()}`,
            phone: details.phone,
            name: details.name,
            role: details.role,
            province: details.province
        };

        // For a new driver, add default vehicle info
        if (details.role === UserRole.DRIVER) {
            (newUser as Driver).vehicle = { model: 'Default Car', plateNumber: '123456', type: VehicleType.NORMAL_CAR };
            (newUser as Driver).rating = 4.5;
            (newUser as Driver).isOnline = true;
        }

        mockUsers[details.phone] = newUser;
        setUser(newUser);
        return newUser; // Successful signup
    }
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
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
