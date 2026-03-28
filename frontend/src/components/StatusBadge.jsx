export default function StatusBadge({ status }) {
  const isOnline = status === "online";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isOnline
          ? "bg-green-500/10 text-green-400 border border-green-500/30"
          : "bg-red-500/10 text-red-400 border border-red-500/30"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"
        }`}
      />
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}
