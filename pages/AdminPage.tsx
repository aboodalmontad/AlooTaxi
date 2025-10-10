import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRide } from '../contexts/RideContext';
import { PricingSettings, VehicleType, DriverPayment, Ride, RideStatus, SyrianProvinces } from '../types';
import { DAMASCUS_COORDS, VEHICLE_TYPES } from '../constants';
import { useApi } from '../App';
import InteractiveMap, { RouteStyle } from '../components/InteractiveMap';

const AdminPage: React.FC = () => {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('drivers');

    const renderContent = () => {
        switch (activeTab) {
            case 'pricing': return <PricingManagement />;
            case 'drivers': return <DriverManagement />;
            case 'accounting': return <DriverAccounting />;
            case 'apiKeys': return <ApiKeysManagement />;
            case 'liveMap': return <LiveMapView />;
            case 'reports': return <ReportsManagement />;
            default: return <DriverManagement />;
        }
    };

    return (
        <div className="flex h-screen bg-slate-900 text-white">
            <aside className="w-64 bg-slate-800 p-4 flex flex-col shadow-lg">
                <h1 className="text-3xl font-bold text-primary mb-8 text-center">ألو تكسي</h1>
                <nav className="flex flex-col space-y-2">
                    <button onClick={() => setActiveTab('liveMap')} className={`p-2 text-right rounded ${activeTab === 'liveMap' ? 'bg-primary' : 'hover:bg-slate-700'}`}>الخريطة الحية</button>
                    <button onClick={() => setActiveTab('drivers')} className={`p-2 text-right rounded ${activeTab === 'drivers' ? 'bg-primary' : 'hover:bg-slate-700'}`}>إدارة السائقين</button>
                    <button onClick={() => setActiveTab('pricing')} className={`p-2 text-right rounded ${activeTab === 'pricing' ? 'bg-primary' : 'hover:bg-slate-700'}`}>إدارة التسعير</button>
                    <button onClick={() => setActiveTab('accounting')} className={`p-2 text-right rounded ${activeTab === 'accounting' ? 'bg-primary' : 'hover:bg-slate-700'}`}>محاسبة السائقين</button>
                    <button onClick={() => setActiveTab('reports')} className={`p-2 text-right rounded ${activeTab === 'reports' ? 'bg-primary' : 'hover:bg-slate-700'}`}>التقارير</button>
                    <button onClick={() => setActiveTab('apiKeys')} className={`p-2 text-right rounded ${activeTab === 'apiKeys' ? 'bg-primary' : 'hover:bg-slate-700'}`}>مفاتيح API</button>
                </nav>
                <div className="mt-auto border-t border-slate-700 pt-4">
                    <p className="text-center">{user?.name}</p>
                    <button onClick={logout} className="w-full mt-2 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700">تسجيل الخروج</button>
                </div>
            </aside>

            <main className="flex-1 p-8 overflow-y-auto">
                {renderContent()}
            </main>
        </div>
    );
};

const PricingManagement: React.FC = () => {
    const { pricing, updatePricing } = useRide();
    const [formState, setFormState] = useState<PricingSettings>(pricing);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, vehicleType: VehicleType) => {
        const { name, value } = e.target;
        setFormState(prevState => ({
            ...prevState,
            [vehicleType]: {
                ...prevState[vehicleType],
                [name]: parseFloat(value)
            }
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updatePricing(formState);
        alert('تم تحديث إعدادات التسعير بنجاح!');
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">إدارة تسعير المركبات</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {VEHICLE_TYPES.map(vehicle => (
                        <div key={vehicle.id} className="bg-slate-800 p-4 rounded-lg shadow-md">
                            <h3 className="text-lg font-semibold text-primary mb-3">{vehicle.ar} {vehicle.icon}</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">الأجرة الأساسية (ل.س)</label>
                                    <input type="number" name="baseFare" value={formState[vehicle.id].baseFare} onChange={(e) => handleChange(e, vehicle.id)} className="w-full p-2 bg-slate-700 rounded border border-slate-600"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">سعر الكيلومتر (ل.س)</label>
                                    <input type="number" name="perKm" value={formState[vehicle.id].perKm} onChange={(e) => handleChange(e, vehicle.id)} className="w-full p-2 bg-slate-700 rounded border border-slate-600"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">سعر الدقيقة (ل.س)</label>
                                    <input type="number" name="perMinute" value={formState[vehicle.id].perMinute} onChange={(e) => handleChange(e, vehicle.id)} className="w-full p-2 bg-slate-700 rounded border border-slate-600"/>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button type="submit" className="w-full max-w-xs mx-auto mt-6 py-3 bg-secondary-DEFAULT text-white font-bold rounded-lg hover:bg-fuchsia-800">حفظ جميع التغييرات</button>
            </form>
        </div>
    );
};

const ReportsManagement: React.FC = () => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">التقارير والإحصائيات</h2>

            <div className="bg-slate-800 p-4 rounded-lg mb-8 flex flex-col md:flex-row items-center gap-4">
                <h3 className="text-lg font-semibold">اختر النطاق الزمني:</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="startDate" className="text-sm">من:</label>
                    <input
                        type="date"
                        id="startDate"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="p-2 bg-slate-700 rounded border border-slate-600 text-white"
                        style={{ colorScheme: 'dark' }}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="endDate" className="text-sm">إلى:</label>
                    <input
                        type="date"
                        id="endDate"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="p-2 bg-slate-700 rounded border border-slate-600 text-white"
                        style={{ colorScheme: 'dark' }}
                    />
                </div>
                <button
                    onClick={() => alert(`سيتم إنشاء التقارير من ${startDate} إلى ${endDate}`)}
                    disabled={!startDate || !endDate}
                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    إنشاء تقرير
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800 p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold text-primary mb-3">ملخص الأرباح</h4>
                    <div className="h-40 flex items-center justify-center text-slate-500">
                        <p>اختر نطاقًا زمنيًا لعرض البيانات.</p>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold text-primary mb-3">ملخص الرحلات</h4>
                     <div className="h-40 flex items-center justify-center text-slate-500">
                        <p>اختر نطاقًا زمنيًا لعرض البيانات.</p>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold text-primary mb-3">أداء السائقين</h4>
                     <div className="h-40 flex items-center justify-center text-slate-500">
                        <p>اختر نطاقًا زمنيًا لعرض البيانات.</p>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold text-primary mb-3">ساعات الذروة</h4>
                     <div className="h-40 flex items-center justify-center text-slate-500">
                        <p>اختر نطاقًا زمنيًا لعرض البيانات.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Driver Data Structures ---
interface DriverData {
    id: string;
    name: string;
    phone: string;
    vehicleType: VehicleType;
    isOnline: boolean;
    isBlocked: boolean;
    // Add location for live map
    location?: { lat: number, lng: number };
    performance: {
        totalRides: number;
        averageRating: number;
        totalEarnings: number;
        weeklyRides: number[]; // [Sat, Sun, Mon, Tue, Wed, Thu, Fri]
    };
}
const initialDrivers: DriverData[] = [
    { id: 'driv1', name: 'سامر السائق', phone: '0987654321', vehicleType: VehicleType.AC_CAR, isOnline: true, isBlocked: false, location: { lat: 33.515, lng: 36.278 }, performance: { totalRides: 152, averageRating: 4.8, totalEarnings: 1850000, weeklyRides: [15, 14, 8, 10, 12, 18, 5] } },
    { id: 'driv4', name: 'محمد الأحمد', phone: '0911111111', vehicleType: VehicleType.NORMAL_CAR, isOnline: false, isBlocked: false, performance: { totalRides: 89, averageRating: 4.5, totalEarnings: 980000, weeklyRides: [0, 0, 10, 9, 11, 14, 12] } },
    { id: 'driv5', name: 'خالد المصري', phone: '0922222222', vehicleType: VehicleType.VIP, isOnline: true, isBlocked: false, location: { lat: 33.500, lng: 36.300 }, performance: { totalRides: 45, averageRating: 4.9, totalEarnings: 2500000, weeklyRides: [2, 3, 1, 4, 3, 5, 4] } },
    { id: 'driv6', name: 'لينا الحسن', phone: '0933333333', vehicleType: VehicleType.MOTORCYCLE, isOnline: false, isBlocked: true, performance: { totalRides: 210, averageRating: 4.2, totalEarnings: 1200000, weeklyRides: [20, 18, 22, 15, 10, 0, 0] } },
];

// --- Driver Performance Modal ---
const DriverPerformanceModal: React.FC<{ driver: DriverData; onClose: () => void; }> = ({ driver, onClose }) => {
    const { performance } = driver;
    const maxWeeklyRides = Math.max(...performance.weeklyRides, 1);
    const weekDays = ['س', 'أ', 'ن', 'ث', 'ر', 'خ', 'ج'];

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                    <h3 className="text-xl font-bold text-primary">أداء السائق: {driver.name}</h3>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-white">&times;</button>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center mb-6">
                    <div>
                        <p className="text-slate-400 text-sm">إجمالي الرحلات</p>
                        <p className="text-2xl font-bold">{performance.totalRides}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">متوسط التقييم</p>
                        <p className="text-2xl font-bold flex items-center justify-center">{performance.averageRating.toFixed(1)} <span className="text-yellow-400 ml-1">★</span></p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">إجمالي الأرباح</p>
                        <p className="text-2xl font-bold">{performance.totalEarnings.toLocaleString('ar-SY')} <span className="text-xs">ل.س</span></p>
                    </div>
                </div>

                <h4 className="font-semibold mb-3 text-center text-slate-300">الرحلات في آخر 7 أيام</h4>
                <div className="flex justify-around items-end h-32 bg-slate-700/50 p-4 rounded-lg">
                    {performance.weeklyRides.map((rides, index) => (
                        <div key={index} className="flex flex-col items-center w-10">
                            <div className="text-xs font-bold mb-1">{rides}</div>
                            <div 
                                className="w-4 bg-primary rounded-t-sm" 
                                style={{ height: `${(rides / maxWeeklyRides) * 100}%` }}
                                title={`${rides} رحلة`}
                            ></div>
                            <div className="text-xs mt-1 text-slate-400">{weekDays[index]}</div>
                        </div>
                    ))}
                </div>

                <button onClick={onClose} className="w-full mt-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-500">إغلاق</button>
            </div>
        </div>
    );
};


const DriverManagement: React.FC = () => {
    const mockNewDrivers = [
        { id: 'driv2', name: 'أحمد جديد', status: 'Pending', date: '2024-05-20' },
        { id: 'driv3', name: 'فاطمة خالد', status: 'Pending', date: '2024-05-19' },
    ];
    
    const [drivers, setDrivers] = useState(initialDrivers);
    const [viewingDriver, setViewingDriver] = useState<DriverData | null>(null);


    const toggleBlock = (driverId: string) => {
        setDrivers(drivers.map(d =>
            d.id === driverId ? { ...d, isBlocked: !d.isBlocked } : d
        ));
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">مراجعة طلبات السائقين الجدد</h2>
            <div className="bg-slate-800 p-4 rounded-lg">
                <div className="divide-y divide-slate-700">
                    {mockNewDrivers.map(driver => (
                        <div key={driver.id} className="flex items-center justify-between p-3">
                            <div>
                                <p className="font-semibold">{driver.name}</p>
                                <p className="text-sm text-slate-400">تاريخ الطلب: {driver.date}</p>
                            </div>
                            <div className="space-x-2 rtl:space-x-reverse">
                                <button className="px-3 py-1 bg-green-600 rounded">موافقة</button>
                                <button className="px-3 py-1 bg-red-600 rounded">رفض</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <h2 className="text-2xl font-bold mt-10 mb-6">قائمة السائقين الحاليين</h2>
            <div className="bg-slate-800 rounded-lg overflow-x-auto shadow-lg">
                <table className="w-full text-right min-w-max">
                    <thead className="bg-slate-700/50">
                        <tr>
                            <th className="p-4 font-semibold">اسم السائق</th>
                            <th className="p-4 font-semibold">رقم الهاتف</th>
                            <th className="p-4 font-semibold">نوع المركبة</th>
                            <th className="p-4 font-semibold">الحالة</th>
                            <th className="p-4 font-semibold">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {drivers.map(driver => (
                            <tr key={driver.id} className={`hover:bg-slate-700/50 transition-colors duration-200 ${driver.isBlocked ? 'opacity-50 bg-slate-900/50' : ''}`}>
                                <td className="p-4">{driver.name}</td>
                                <td className="p-4" dir="ltr">{driver.phone}</td>
                                <td className="p-4">{VEHICLE_TYPES.find(v => v.id === driver.vehicleType)?.ar || 'غير محدد'}</td>
                                <td className="p-4">
                                    <div className="flex items-center">
                                        <span className={`h-3 w-3 rounded-full mr-2 ${driver.isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span>
                                        <span>{driver.isOnline ? 'متصل' : 'غير متصل'}</span>
                                    </div>
                                </td>
                                <td className="p-4 space-x-2 rtl:space-x-reverse whitespace-nowrap">
                                    <button className="px-3 py-1 bg-primary/70 text-sm rounded hover:bg-primary">عرض التفاصيل</button>
                                    <button 
                                        onClick={() => setViewingDriver(driver)}
                                        className="px-3 py-1 bg-blue-600 text-sm rounded hover:bg-blue-700">
                                        عرض الأداء
                                    </button>
                                    <button 
                                        onClick={() => toggleBlock(driver.id)}
                                        className={`px-3 py-1 text-sm rounded ${driver.isBlocked ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        {driver.isBlocked ? 'رفع الحظر' : 'حظر'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {viewingDriver && <DriverPerformanceModal driver={viewingDriver} onClose={() => setViewingDriver(null)} />}
        </div>
    );
};

// --- Mock Data for Accounting ---
const mockCompletedRides: Ride[] = [
    { id: 'ride1', driverId: 'driv1', customerId: 'c1', status: RideStatus.COMPLETED, finalFare: 12500, completedAt: '2024-05-20T10:00:00Z', startLocation: {name: 'المزة'}, endLocation: {name: 'البرامكة'} } as Ride,
    { id: 'ride2', driverId: 'driv4', customerId: 'c2', status: RideStatus.COMPLETED, finalFare: 8000, completedAt: '2024-05-20T11:00:00Z', startLocation: {name: 'الحمدانية'}, endLocation: {name: 'الجميلية'} } as Ride,
    { id: 'ride3', driverId: 'driv1', customerId: 'c3', status: RideStatus.COMPLETED, finalFare: 25000, completedAt: '2024-05-21T14:30:00Z', startLocation: {name: 'مشروع دمر'}, endLocation: {name: 'المطار'} } as Ride,
    { id: 'ride4', driverId: 'driv5', customerId: 'c4', status: RideStatus.COMPLETED, finalFare: 45000, completedAt: '2024-05-22T09:00:00Z', startLocation: {name: 'فندق الفور سيزن'}, endLocation: {name: 'صحنايا'} } as Ride,
    { id: 'ride5', driverId: 'driv1', customerId: 'c5', status: RideStatus.COMPLETED, finalFare: 9000, completedAt: '2024-05-23T18:00:00Z', startLocation: {name: 'باب توما'}, endLocation: {name: 'العباسيين'} } as Ride,
];

const mockDriverPayments: DriverPayment[] = [
    { id: 'pay1', driverId: 'driv1', amount: 3000, date: '2024-05-22T12:00:00Z' },
    { id: 'pay2', driverId: 'driv4', amount: 5000, date: '2024-05-23T15:00:00Z' },
];

const SITE_COMMISSION_RATE = 0.20; // 20%

const DriverAccounting: React.FC = () => {
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [payments, setPayments] = useState(mockDriverPayments);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);

    const report = useMemo(() => {
        if (!selectedDriverId || !startDate || !endDate) return null;

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the whole end day

        const driverTrips = mockCompletedRides.filter(ride => 
            ride.driverId === selectedDriverId &&
            ride.completedAt &&
            new Date(ride.completedAt) >= start &&
            new Date(ride.completedAt) <= end
        );

        const driverPayments = payments.filter(payment => 
            payment.driverId === selectedDriverId &&
            new Date(payment.date) >= start &&
            new Date(payment.date) <= end
        );

        const totalFares = driverTrips.reduce((sum, trip) => sum + (trip.finalFare || 0), 0);
        const totalCommission = totalFares * SITE_COMMISSION_RATE;
        const totalPaid = driverPayments.reduce((sum, payment) => sum + payment.amount, 0);
        const balance = totalCommission - totalPaid;

        return { driverTrips, driverPayments, totalFares, totalCommission, totalPaid, balance };
    }, [selectedDriverId, startDate, endDate, payments]);

    const handleAddPayment = (amount: number) => {
        if (!selectedDriverId) return;
        const newPayment: DriverPayment = {
            id: `pay_${Date.now()}`,
            driverId: selectedDriverId,
            amount: amount,
            date: new Date().toISOString(),
        };
        setPayments(prev => [...prev, newPayment]);
        setPaymentModalOpen(false);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">محاسبة السائقين</h2>

            {isPaymentModalOpen && selectedDriverId && (
                <AddPaymentModal 
                    driverName={initialDrivers.find(d => d.id === selectedDriverId)?.name || ''}
                    onClose={() => setPaymentModalOpen(false)}
                    onAddPayment={handleAddPayment}
                />
            )}

            <div className="bg-slate-800 p-4 rounded-lg mb-8 flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1">
                    <label htmlFor="driverSelect" className="text-sm">اختر السائق:</label>
                    <select id="driverSelect" value={selectedDriverId || ''} onChange={e => setSelectedDriverId(e.target.value)} className="w-full p-2 bg-slate-700 rounded border border-slate-600 text-white mt-1">
                        <option value="">-- اختر سائق --</option>
                        {initialDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="startDate" className="text-sm">من:</label>
                    <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 bg-slate-700 rounded border border-slate-600 text-white" style={{ colorScheme: 'dark' }} />
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="endDate" className="text-sm">إلى:</label>
                    <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 bg-slate-700 rounded border border-slate-600 text-white" style={{ colorScheme: 'dark' }} />
                </div>
            </div>

            {!report && (
                 <div className="text-center text-slate-400 p-10 bg-slate-800 rounded-lg">
                    <p>الرجاء اختيار سائق وتحديد نطاق زمني لعرض التقرير المالي.</p>
                </div>
            )}
            
            {report && (
                <div className="space-y-8">
                    {/* Summary Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-slate-400 text-sm">إجمالي الأجرة المحصلة</p>
                            <p className="text-2xl font-bold">{report.totalFares.toLocaleString()} ل.س</p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-slate-400 text-sm">نسبة الموقع المستحقة ({SITE_COMMISSION_RATE * 100}%)</p>
                            <p className="text-2xl font-bold text-primary">{report.totalCommission.toLocaleString()} ل.س</p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-slate-400 text-sm">إجمالي المدفوعات</p>
                            <p className="text-2xl font-bold text-green-500">{report.totalPaid.toLocaleString()} ل.س</p>
                        </div>
                        <div className={`p-4 rounded-lg ${report.balance > 0 ? 'bg-red-900' : 'bg-green-900'}`}>
                            <p className="text-sm">{report.balance > 0 ? 'الرصيد المتبقي على السائق' : 'الرصيد الزائد للسائق'}</p>
                            <p className="text-2xl font-bold">{Math.abs(report.balance).toLocaleString()} ل.س</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={() => setPaymentModalOpen(true)} className="px-6 py-2 bg-secondary-DEFAULT text-white font-bold rounded-lg hover:bg-fuchsia-800">إضافة دفعة جديدة</button>
                    </div>

                    {/* Trips Table */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">سجل الرحلات</h3>
                        <div className="bg-slate-800 rounded-lg overflow-hidden">
                            <table className="w-full text-right">
                                <thead className="bg-slate-700"><tr>
                                    <th className="p-3">التاريخ</th><th className="p-3">من</th><th className="p-3">إلى</th><th className="p-3">الأجرة النهائية</th><th className="p-3">نسبة الموقع</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700">
                                    {report.driverTrips.map(trip => (
                                        <tr key={trip.id}>
                                            <td className="p-3">{new Date(trip.completedAt!).toLocaleDateString('ar-SY')}</td>
                                            <td className="p-3">{trip.startLocation.name}</td>
                                            <td className="p-3">{trip.endLocation.name}</td>
                                            <td className="p-3">{(trip.finalFare || 0).toLocaleString()} ل.س</td>
                                            <td className="p-3 text-primary">{((trip.finalFare || 0) * SITE_COMMISSION_RATE).toLocaleString()} ل.س</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Payments Table */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">سجل الدفعات</h3>
                        <div className="bg-slate-800 rounded-lg overflow-hidden">
                            <table className="w-full text-right">
                                <thead className="bg-slate-700"><tr>
                                    <th className="p-3">تاريخ الدفعة</th><th className="p-3">المبلغ المدفوع</th>
                                </tr></thead>
                                <tbody className="divide-y divide-slate-700">
                                    {report.driverPayments.map(payment => (
                                        <tr key={payment.id}>
                                            <td className="p-3">{new Date(payment.date).toLocaleString('ar-SY')}</td>
                                            <td className="p-3 text-green-500">{payment.amount.toLocaleString()} ل.س</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const AddPaymentModal: React.FC<{ driverName: string; onClose: () => void; onAddPayment: (amount: number) => void; }> = ({ driverName, onClose, onAddPayment }) => {
    const [amount, setAmount] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const paymentAmount = parseFloat(amount);
        if (!isNaN(paymentAmount) && paymentAmount > 0) {
            onAddPayment(paymentAmount);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4">إضافة دفعة للسائق: <span className="text-primary">{driverName}</span></h3>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="paymentAmount" className="block mb-2">المبلغ المدفوع (ل.س):</label>
                    <input 
                        type="number" 
                        id="paymentAmount"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="w-full p-2 bg-slate-700 rounded border border-slate-600 mb-4"
                        autoFocus
                    />
                    <div className="flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-600 rounded hover:bg-slate-500">إلغاء</button>
                        <button type="submit" className="px-4 py-2 bg-primary rounded hover:bg-primary-dark">حفظ الدفعة</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const ApiKeysManagement: React.FC = () => {
    const { apiKey, updateApiKey } = useApi();
    const [localApiKey, setLocalApiKey] = useState(apiKey);

    const handleSave = () => {
        updateApiKey(localApiKey);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">إدارة مفاتيح API</h2>
            <div className="max-w-xl space-y-4 bg-slate-800 p-6 rounded-lg">
                <div>
                    <label className="block mb-1">مفتاح Openrouteservice (heigit.org)</label>
                    <input 
                        type="text" 
                        value={localApiKey} 
                        onChange={(e) => setLocalApiKey(e.target.value)} 
                        className="w-full p-2 bg-slate-700 rounded font-mono text-left" 
                        dir="ltr" 
                    />
                </div>
                <button onClick={handleSave} className="w-full py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark">حفظ المفتاح</button>
            </div>
        </div>
    );
};


// --- Live Map View ---
const mockActiveRides: Ride[] = [
    {
        id: 'activeride_1',
        status: RideStatus.PICKING_UP,
        driverId: 'driv1',
        startLocation: { lat: 33.5138, lng: 36.2765, name: "ساحة المرجة" },
        endLocation: { lat: 33.522, lng: 36.29, name: "كلية الطب" },
        polyline: [[33.5138, 36.2765], [33.515, 36.28], [33.522, 36.29]],
    } as Ride,
    {
        id: 'activeride_2',
        status: RideStatus.IN_PROGRESS,
        driverId: 'driv5',
        startLocation: { lat: 33.505, lng: 36.295, name: "فندق الشام" },
        endLocation: { lat: 33.49, lng: 36.25, name: "كفرسوسة" },
        polyline: [[33.505, 36.295], [33.500, 36.28], [33.49, 36.25]],
    } as Ride,
];


const LiveMapView: React.FC = () => {
    const [drivers, setDrivers] = useState<DriverData[]>(initialDrivers);
    const [rides] = useState<Ride[]>(mockActiveRides);
    const [isAutoFitEnabled, setIsAutoFitEnabled] = useState(true);

    // Simulate driver movement
    useEffect(() => {
        const interval = setInterval(() => {
            setDrivers(prevDrivers =>
                prevDrivers.map(driver => {
                    if (driver.isOnline && driver.location) {
                        return {
                            ...driver,
                            location: {
                                lat: driver.location.lat + (Math.random() - 0.5) * 0.001,
                                lng: driver.location.lng + (Math.random() - 0.5) * 0.001,
                            },
                        };
                    }
                    return driver;
                })
            );
        }, 3000); // Update every 3 seconds

        return () => clearInterval(interval);
    }, []);

    const onlineDrivers = drivers.filter(d => d.isOnline && d.location);
    const routes: RouteStyle[] = rides.map(ride => ({
        polyline: ride.polyline,
        color: ride.status === RideStatus.PICKING_UP ? '#8b5cf6' : '#3b82f6', // Purple for pickup, Blue for in-progress
        weight: 5,
    }));

    return (
        <div className="h-full w-full flex flex-col relative">
            <h2 className="text-2xl font-bold mb-4">الخريطة الحية للمركبات والرحلات</h2>
            <div className="flex-grow relative rounded-lg overflow-hidden shadow-lg">
                 {!isAutoFitEnabled && (
                    <button
                        onClick={() => setIsAutoFitEnabled(true)}
                        className="absolute top-4 right-4 w-12 h-12 bg-slate-800/80 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl hover:bg-slate-700 z-10 shadow-lg"
                        aria-label="إعادة ضبط عرض الخريطة"
                        title="إعادة ضبط عرض الخريطة"
                    >
                        🔄
                    </button>
                )}
                <InteractiveMap
                    center={DAMASCUS_COORDS}
                    zoom={12}
                    routes={routes}
                    onUserInteraction={() => setIsAutoFitEnabled(false)}
                    disableAutoPanZoom={!isAutoFitEnabled}
                >
                    {onlineDrivers.map(driver => (
                         <InteractiveMap.DriverMarker
                            key={driver.id}
                            position={[driver.location!.lat, driver.location!.lng]}
                            popupContent={`
                                <strong>${driver.name}</strong><br/>
                                الحالة: ${driver.isOnline ? 'متصل' : 'غير متصل'}<br/>
                                المركبة: ${VEHICLE_TYPES.find(v => v.id === driver.vehicleType)?.ar || ''}
                            `}
                         />
                    ))}
                </InteractiveMap>
            </div>
             <div className="flex items-center justify-center mt-4 gap-6 text-sm">
                <div className="flex items-center gap-2"><div className="w-8 h-1 bg-[#3b82f6]"></div><span>رحلة جارية</span></div>
                <div className="flex items-center gap-2"><div className="w-8 h-1 bg-[#8b5cf6]"></div><span>في الطريق للزبون</span></div>
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#f97316"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5S18.33 16 17.5 16zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                    <span>سائق متصل</span>
                </div>
            </div>
        </div>
    );
};


export default AdminPage;