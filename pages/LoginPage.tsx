import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, SyrianProvinces, VehicleType, Driver, DriverStatus } from '../types';
import { SYRIAN_PROVINCES, VEHICLE_TYPES } from '../constants';
import { mockUsers } from '../contexts/AuthContext';


const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'verify'>('login');
  
  // Shared state
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  // Signup-only state
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [province, setProvince] = useState<SyrianProvinces>(SyrianProvinces.DAMASCUS);
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(VehicleType.NORMAL_CAR);
  
  // Verification-only state
  const [userToVerify, setUserToVerify] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, signup, verifyAndLogin } = useAuth();
  const navigate = useNavigate();

  const resetForm = () => {
    setPhone('');
    setPassword('');
    setRole(UserRole.CUSTOMER);
    setName('');
    setConfirmPassword('');
    setProvince(SyrianProvinces.DAMASCUS);
    setVehicleModel('');
    setVehiclePlate('');
    setVehicleType(VehicleType.NORMAL_CAR);
    setError('');
  };

  const handleLoginOrSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const trimmedPhone = phone.trim();
        const trimmedPassword = password.trim();
        const user = await login({ phone: trimmedPhone, password: trimmedPassword });

        if (user) {
            if (user.role === UserRole.ADMIN) navigate('/admin');
            else if (user.role === UserRole.DRIVER) navigate('/driver');
            else navigate('/customer');
        } else {
            const potentialUser = mockUsers[trimmedPhone];
            if (potentialUser && potentialUser.role === UserRole.DRIVER) {
                const driver = potentialUser as Driver;
                if (driver.password === trimmedPassword && driver.status === DriverStatus.APPROVED && !driver.isVerified) {
                    // Correct credentials, but needs verification
                    setUserToVerify(driver.phone);
                    setMode('verify');
                    setError('');
                    setIsLoading(false);
                    return; // Stop execution to show verification screen
                }
                
                if (driver.status === DriverStatus.PENDING) {
                    setError('حسابك قيد المراجعة من قبل الإدارة.');
                } else if (driver.status === DriverStatus.REJECTED) {
                    setError('تم رفض طلب تسجيلك. يرجى التواصل مع الإدارة.');
                } else if (driver.isBlocked) {
                    setError('تم حظر حسابك. يرجى التواصل مع الإدارة.');
                } else {
                    setError('بيانات الاعتماد غير صالحة. حاول مرة أخرى.');
                }
            } else {
                setError('بيانات الاعتماد غير صالحة. حاول مرة أخرى.');
            }
        }
      } else { // Signup mode
        if (password !== confirmPassword) {
            setError('كلمات المرور غير متطابقة.');
            setIsLoading(false);
            return;
        }
        
        const signupDetails = {
            name: name.trim(),
            phone: phone.trim(),
            password: password.trim(),
            role,
            province: role !== UserRole.ADMIN ? province : undefined,
            vehicle: role === UserRole.DRIVER ? { model: vehicleModel.trim(), plateNumber: vehiclePlate.trim(), type: vehicleType } : undefined
        };
        
        const newUser = await signup(signupDetails);
        if(!newUser) {
            setError('هذا الرقم مسجل بالفعل. حاول تسجيل الدخول.');
        } else {
            if (newUser.role === UserRole.DRIVER) {
                alert('تم إرسال طلب تسجيلك بنجاح! ستتم مراجعته من قبل الإدارة وسيتم إعلامك عند الموافقة.');
                resetForm();
                setMode('login');
            } else {
                // Customer is logged in automatically and redirected
                navigate('/customer');
            }
        }
      }
    } catch (err) {
      setError('حدث خطأ. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    if (!userToVerify) {
        setError('حدث خطأ. يرجى محاولة تسجيل الدخول مرة أخرى.');
        setMode('login');
        setIsLoading(false);
        return;
    }

    const verifiedUser = await verifyAndLogin(userToVerify, verificationCode.trim());
    
    if (verifiedUser) {
        navigate('/driver');
    } else {
        setError('الرمز غير صحيح. يرجى المحاولة مرة أخرى.');
    }
    setIsLoading(false);
  };
  
  const renderSignupFields = () => (
    <>
      <div className="animate-fade-in space-y-6">
        <div>
          <label htmlFor="role-signup" className="block text-sm font-medium text-slate-300 mb-1">أنا</label>
          <select
              id="role-signup"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
          >
              <option value={UserRole.CUSTOMER}>زبون</option>
              <option value={UserRole.DRIVER}>سائق</option>
          </select>
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">الاسم الكامل</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
            placeholder="مثال: أحمد العلي"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">تأكيد كلمة المرور</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
            placeholder="********"
          />
        </div>

        {role !== UserRole.ADMIN && (
          <div>
            <label htmlFor="province" className="block text-sm font-medium text-slate-300 mb-1">المحافظة</label>
            <select
              id="province"
              value={province}
              onChange={(e) => setProvince(e.target.value as SyrianProvinces)}
              className="w-full px-3 py-2 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
            >
              {SYRIAN_PROVINCES.map(p => <option key={p.id} value={p.id}>{p.ar}</option>)}
            </select>
          </div>
        )}

        {role === UserRole.DRIVER && (
            <>
              <div className="pt-4 border-t border-slate-600">
                <h3 className="font-semibold text-slate-200">معلومات المركبة</h3>
              </div>
              <div>
                <label htmlFor="vehicleModel" className="block text-sm font-medium text-slate-300 mb-1">طراز المركبة</label>
                <input type="text" id="vehicleModel" value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md" placeholder="مثال: Kia Rio" />
              </div>
              <div>
                <label htmlFor="vehiclePlate" className="block text-sm font-medium text-slate-300 mb-1">رقم اللوحة</label>
                <input type="text" id="vehiclePlate" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md" placeholder="123456" />
              </div>
              <div>
                <label htmlFor="vehicleType" className="block text-sm font-medium text-slate-300 mb-1">نوع المركبة</label>
                <select id="vehicleType" value={vehicleType} onChange={e => setVehicleType(e.target.value as VehicleType)} className="w-full px-3 py-2 text-white bg-slate-700 border border-slate-600 rounded-md">
                  {VEHICLE_TYPES.map(vt => <option key={vt.id} value={vt.id}>{vt.ar}</option>)}
                </select>
              </div>
            </>
        )}
      </div>
    </>
  );

  const renderVerificationForm = () => (
    <form className="space-y-6" onSubmit={handleVerify}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary">تفعيل الحساب</h2>
        <p className="mt-2 text-slate-300">
          تمت الموافقة على حسابك! يرجى إدخال رمز التفعيل الذي أرسله لك المدير لتأكيد رقم هاتفك.
        </p>
      </div>
      <div>
        <label htmlFor="verificationCode" className="block text-sm font-medium text-slate-300 mb-1">رمز التفعيل</label>
        <input
          id="verificationCode"
          type="text"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          required
          className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary text-center tracking-[0.5em]"
          placeholder="------"
          maxLength={6}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-3 font-semibold text-white transition-transform duration-200 bg-primary rounded-md hover:bg-primary-dark disabled:bg-slate-500 transform hover:scale-105"
        >
          {isLoading ? 'جارِ التحقق...' : 'تفعيل وتسجيل الدخول'}
        </button>
      </div>
      <div className="text-center">
        <button type="button" onClick={() => { setMode('login'); setError(''); setUserToVerify(null); }} className="text-sm text-slate-400 hover:text-white">
          العودة إلى تسجيل الدخول
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-slate-800 rounded-2xl shadow-2xl shadow-primary/20">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary">ألو تكسي</h1>
           {mode !== 'verify' && <p className="mt-2 text-slate-400">{mode === 'login' ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد'}</p>}
        </div>

        {mode !== 'verify' && (
            <div className="flex justify-center bg-slate-700 rounded-md p-1">
                <button onClick={() => { setMode('login'); setError(''); }} className={`w-1/2 py-2 rounded-md transition ${mode === 'login' ? 'bg-primary text-white' : 'text-slate-300'}`}>تسجيل الدخول</button>
                <button onClick={() => { setMode('signup'); setError(''); }} className={`w-1/2 py-2 rounded-md transition ${mode === 'signup' ? 'bg-primary text-white' : 'text-slate-300'}`}>حساب جديد</button>
            </div>
        )}
        
        {mode === 'verify' ? renderVerificationForm() : (
            <form className="space-y-6" onSubmit={handleLoginOrSignup}>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">رقم الهاتف</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
                  placeholder="09xxxxxxxx"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">كلمة المرور</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
                  placeholder="********"
                />
              </div>
              
              {mode === 'signup' && renderSignupFields()}

              {error && <p className="text-sm text-red-400 text-center">{error}</p>}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full px-4 py-3 font-semibold text-white transition-transform duration-200 bg-primary rounded-md hover:bg-primary-dark disabled:bg-slate-500 transform hover:scale-105"
                >
                  {isLoading ? 'جارِ التحميل...' : (mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب')}
                </button>
              </div>
            </form>
        )}
         <div className="text-xs text-slate-500 text-center space-y-1">
            <p>زبون: 0912345678 (كلمة المرور: 123)</p>
            <p>سائق: 0987654321 (كلمة المرور: 123)</p>
            <p>مدير: 0999999999 (كلمة المرور: admin123)</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;