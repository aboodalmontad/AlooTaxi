import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, SyrianProvinces } from '../types';
import { SYRIAN_PROVINCES } from '../constants';

const LoginPage: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [province, setProvince] = useState<SyrianProvinces>(SyrianProvinces.DAMASCUS);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      // For Admin, 'name' field is used as a password.
      // Trim inputs to avoid issues with accidental whitespace.
      const loginDetails = {
          name: name.trim(),
          phone: phone.trim(),
          role,
          province: role !== UserRole.ADMIN ? province : undefined,
      };

      const user = await login(loginDetails);

      if (user) {
        if (user.role === UserRole.ADMIN) navigate('/admin');
        else if (user.role === UserRole.DRIVER) navigate('/driver');
        else navigate('/customer');
      } else {
        setError('بيانات الاعتماد غير صالحة. حاول مرة أخرى.');
      }
    } catch (err) {
      setError('حدث خطأ. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-slate-800 rounded-2xl shadow-2xl shadow-primary/20">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary">ألو تكسي</h1>
          <p className="mt-2 text-slate-400">تسجيل الدخول أو إنشاء حساب</p>
        </div>
        <form className="space-y-6" onSubmit={handleLogin}>
          
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-slate-300 mb-1">أنا</label>
            <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
            >
                <option value={UserRole.CUSTOMER}>زبون</option>
                <option value={UserRole.DRIVER}>سائق</option>
                <option value={UserRole.ADMIN}>إدارة</option>
            </select>
          </div>

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
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">{role === UserRole.ADMIN ? 'كلمة المرور' : 'الاسم الكامل'}</label>
            <input
              id="name"
              type={role === UserRole.ADMIN ? 'password' : 'text'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 mt-1 text-white bg-slate-700 border border-slate-600 rounded-md focus:ring-primary focus:border-primary"
              placeholder={role === UserRole.ADMIN ? '********' : 'مثال: أحمد العلي'}
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

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 font-semibold text-white transition-transform duration-200 bg-primary rounded-md hover:bg-primary-dark disabled:bg-slate-500 transform hover:scale-105"
            >
              {isLoading ? 'جارِ التحميل...' : 'متابعة'}
            </button>
          </div>
        </form>
         <div className="text-xs text-slate-500 text-center space-y-1">
            <p>زبون: 0912345678 (أي اسم)</p>
            <p>سائق: 0987654321 (أي اسم)</p>
            <p>مدير: 0999999999 (كلمة المرور: admin123)</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;