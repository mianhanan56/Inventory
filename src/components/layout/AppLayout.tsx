import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Sidebar />
      <main className="md:ml-64 min-h-screen transition-all duration-300">
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
