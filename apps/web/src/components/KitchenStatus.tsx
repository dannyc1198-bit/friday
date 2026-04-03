"use client";

interface KitchenStatusProps {
  messLevel: number;
  consecutiveNags: number;
  totalNagsToday: number;
  totalCleanupsToday: number;
  dailyEvents: string[];
}

const ESCALATION_LABELS = ["Gentle", "Firm", "Stern", "Drill Sergeant"];

export function KitchenStatus({
  messLevel,
  consecutiveNags,
  totalNagsToday,
  totalCleanupsToday,
  dailyEvents,
}: KitchenStatusProps) {
  const escalationLevel = ESCALATION_LABELS[Math.min(consecutiveNags, ESCALATION_LABELS.length - 1)] || "Gentle";
  const messColor = messLevel >= 7 ? "text-red-400" : messLevel >= 4 ? "text-yellow-400" : "text-green-400";
  const barWidth = Math.min(messLevel * 10, 100);

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50">
      <div className="px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Kitchen Nagger</span>
      </div>

      <div className="p-3 space-y-3">
        {/* Mess Level Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Mess Level</span>
            <span className={`font-bold ${messColor}`}>{messLevel}/10</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                messLevel >= 7 ? "bg-red-500" : messLevel >= 4 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-lg font-bold text-orange-400">{totalNagsToday}</div>
            <div className="text-[10px] text-gray-500">Nags Today</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className="text-lg font-bold text-green-400">{totalCleanupsToday}</div>
            <div className="text-[10px] text-gray-500">Cleanups</div>
          </div>
          <div className="bg-gray-800/50 rounded p-2">
            <div className={`text-xs font-bold ${consecutiveNags > 0 ? "text-red-400" : "text-gray-400"}`}>
              {escalationLevel}
            </div>
            <div className="text-[10px] text-gray-500">Tone</div>
          </div>
        </div>

        {/* Recent Events */}
        {dailyEvents.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase mb-1">Today</div>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {dailyEvents.slice(-5).reverse().map((event, i) => (
                <div key={i} className="text-[11px] text-gray-400 font-mono truncate">
                  {event}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
