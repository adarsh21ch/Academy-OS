import React from "react";
import { User, QrCode, Building2 } from "lucide-react";

interface StudentIDCardProps {
  student: {
    name: string;
    player_id?: string | null;
    photo_url?: string | null;
    joined_at?: string | null;
    dob?: string | null;
    sport?: string | null;
    academy_name?: string;
    academy_logo?: string;
    academy_address?: string | null;
    academy_phone?: string | null;
    phone?: string;
    session?: string;
    batch_timing?: string | null;
    primary_color?: string;
  };
  side?: "front" | "back";
}

export const StudentIDCard = React.forwardRef<HTMLDivElement, StudentIDCardProps>(
  ({ student, side = "front" }, ref) => {
    const brandColor = student.primary_color || "#0A1628";

    const formatDate = (dateStr?: string | null) => {
      if (!dateStr) return "—";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).toUpperCase();
      } catch {
        return "—";
      }
    };

    const formatMemberSince = (dateStr?: string | null) => {
      if (!dateStr) return "—";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric",
        }).toUpperCase();
      } catch {
        return "—";
      }
    };

    const formatSession = (session?: string) => {
      if (!session) return "General Session";
      const s = session.toLowerCase();
      if (s.includes("both session")) return "Morning + Evening";
      // Capitalize first letter of each word
      return s.replace(/\b\w/g, l => l.toUpperCase());
    };


    // Card dimensions for preview
    const cardWidth = 240;
    const cardHeight = 380;

    if (side === "back") {
      return (
        <div className="p-4 bg-background flex items-center justify-center">
          <div
            ref={ref}
            className="w-[240px] h-[380px] bg-white text-slate-900 shadow-2xl rounded-2xl overflow-hidden relative border border-slate-200 flex flex-col"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* Back Header */}
            <div 
              className="h-[60px] px-4 flex flex-col items-center justify-center text-white shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              <div className="font-black tracking-tight text-[11px] uppercase text-center leading-tight line-clamp-2">
                {student.academy_name || "Cricket Academy OS"}
              </div>
            </div>

            {/* Back Body */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
                <div className="text-center">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2">Scan for Attendance</p>
                  <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mx-auto w-fit">
                    <QrCode className="size-[120px] text-slate-900" />
                  </div>
                </div>
                
                <div className="w-full text-center space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Session / Batch</p>
                  <p className="text-[18px] font-black text-slate-900 leading-tight uppercase px-2">
                    {formatSession(student.session)}
                  </p>
                </div>

            </div>

            {/* Footer */}
            <div 
              className="h-[40px] px-4 flex flex-col items-center justify-center shrink-0"
              style={{ backgroundColor: brandColor }}
            >
               <div className="text-[7px] font-bold text-white uppercase tracking-[0.2em] opacity-90">
                  Building Champions, Inspiring Futures
               </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 bg-background flex items-center justify-center">
        <div
          ref={ref}
          className="w-[240px] h-[380px] bg-white text-slate-900 shadow-2xl rounded-2xl overflow-hidden relative border border-slate-200 flex flex-col"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* Curved Header */}
          <div 
            className="h-[80px] pt-4 px-4 flex flex-col items-center bg-slate-900 relative shrink-0 overflow-hidden"
            style={{ backgroundColor: brandColor }}
          >
            <div className="flex items-center gap-2 mb-1 z-10">
              {student.academy_logo ? (
                <img src={student.academy_logo} alt="Logo" className="h-10 object-contain brightness-0 invert" />
              ) : (
                <Building2 className="size-6 text-white" />
              )}
            </div>
            <div className="font-black tracking-tight text-[11px] uppercase text-center leading-tight z-10 text-white">
              {student.academy_name || "Cricket Academy OS"}
            </div>
            {/* Wave shape */}
              <div 
                className="absolute -bottom-7 left-0 right-0 h-14 bg-white rounded-[50%]"
                style={{ transform: 'scaleX(1.4)' }}
              />
          </div>

          {/* Front Body */}
          <div className="flex-1 flex flex-col items-center px-4 pt-1">
            {/* Photo */}
            <div className="w-[100px] h-[110px] rounded-xl border-2 border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center shadow-md mb-3 shrink-0 z-20">
              {student.photo_url ? (
                <img src={student.photo_url} alt={student.name} className="size-full object-cover" />
              ) : (
                <User className="size-12 text-slate-200" />
              )}
            </div>

            {/* Name */}
            <h2 
              className="text-[17px] font-black uppercase text-center leading-tight mb-4 px-1 line-clamp-2"
              style={{ color: brandColor }}
            >
              {student.name}
            </h2>

            {/* Details Area */}
            <div className="w-full space-y-3.5 text-[11px] mt-2">
               <div className="flex items-center justify-between border-b border-slate-50 pb-1">
                 <span className="font-bold text-slate-400 uppercase tracking-tighter shrink-0">Player ID</span>
                 <span className="font-black text-slate-900">{student.player_id || "—"}</span>
               </div>
               <div className="flex items-center justify-between border-b border-slate-50 pb-1">
                 <span className="font-bold text-slate-400 uppercase tracking-tighter shrink-0">Date of Birth</span>
                 <span className="font-black text-slate-900">{formatDate(student.dob)}</span>
               </div>
               <div className="flex items-center justify-between border-b border-slate-50 pb-1">
                 <span className="font-bold text-slate-400 uppercase tracking-tighter shrink-0">Sport</span>
                 <span className="font-black text-slate-900 uppercase">{student.sport || "Cricket"}</span>
               </div>
               <div className="flex items-center justify-between border-b border-slate-50 pb-1">
                 <span className="font-bold text-slate-400 uppercase tracking-tighter shrink-0">Contact</span>
                 <span className="font-black text-slate-900">{student.phone || "—"}</span>
               </div>
               <div className="flex flex-col gap-1">
                 <span className="font-bold text-slate-400 uppercase tracking-tighter shrink-0">Address</span>
                 <span className="font-bold text-slate-800 leading-tight line-clamp-2">
                   {student.academy_address || "—"}
                 </span>
               </div>
            </div>

          </div>

          {/* Footer */}
          <div 
            className="h-[45px] px-4 flex items-center justify-between text-white shrink-0"
            style={{ backgroundColor: brandColor }}
          >
             <div className="flex flex-col">
                <span className="text-[6px] font-bold text-white/60 uppercase tracking-widest">Member Since</span>
                <span className="text-[10px] font-black">{formatMemberSince(student.joined_at)}</span>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-widest text-white">Official</span>
                <span className="text-[7px] font-bold uppercase tracking-tighter text-white/80">Player ID Card</span>
             </div>
          </div>
        </div>
      </div>
    );
  }
);

StudentIDCard.displayName = "StudentIDCard";
