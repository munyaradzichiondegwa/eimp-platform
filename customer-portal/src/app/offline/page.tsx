import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <WifiOff className="w-7 h-7 text-gray-400" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">You&apos;re offline</h1>
        <p className="text-sm text-gray-500">
          Check your connection and try again. Your policies and claims will be right here once you&apos;re back online.
        </p>
      </div>
    </div>
  );
}
