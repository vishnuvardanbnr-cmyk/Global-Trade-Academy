import { motion } from "framer-motion";
import { BarChart3, Clock, LogOut, RefreshCw } from "lucide-react";
import { useAuthContext } from "@/lib/authContext";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PendingApprovalPage() {
  const { user, signOut, refetch } = useAuthContext();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user) { navigate("/sign-in"); return; }
    if ((user as any).status === "active") {
      if (user.role === "instructor") { navigate("/instructor"); return; }
      if (user.role === "admin") { navigate("/admin"); return; }
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const handleCheckStatus = async () => {
    await refetch();
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#f4f4f5] px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[480px]"
      >
        <div className="bg-white rounded-2xl border border-[#e4e4e7] shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-8 pt-8 pb-6 border-b border-[#f4f4f5]">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[15px] tracking-tight text-[#09090b]">Bright Insight</span>
            </div>
          </div>

          <div className="px-8 py-10 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
              <Clock className="h-7 w-7 text-amber-500" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-[#09090b]">Waiting for approval</h1>
              <p className="text-sm text-[#71717a] leading-relaxed max-w-[340px]">
                Your account has been created and is pending review. An admin will approve your access shortly.
                You'll be able to log in once approved.
              </p>
            </div>

            {user && (
              <div className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-sm">
                <span className="text-[#71717a]">Registered as </span>
                <span className="font-semibold text-[#09090b]">{user.email}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 w-full pt-2">
              <button
                onClick={handleCheckStatus}
                className="w-full h-10 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Check approval status
              </button>
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                className="w-full h-10 rounded-xl border border-[#e4e4e7] bg-white hover:bg-[#fafafa] text-sm font-semibold text-[#3f3f46] transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>

          <div className="px-8 py-4 bg-[#fafafa] border-t border-[#f4f4f5] text-center">
            <p className="text-xs text-[#a1a1aa]">
              If you have questions, contact support.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
