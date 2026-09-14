import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  UserCircle,
  Phone,
  Mail,
  HeartPulse,
  Calendar,
  IdCard,
  Award,
  Trophy,
  LogOut,
  FileText,
  CalendarDays,
  Building2,
  Download,
  Loader2,
  MapPin,
  Eye,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyPortalContext, fetchStudentProfile, studentKeys } from "@/lib/student-app";
import { PlayerPhotoUploader } from "@/components/match-center/PlayerPhotoUploader";
import { AccountCard } from "@/components/settings/AccountCard";
import { EditMyProfileDialog } from "@/components/portal/EditMyProfileDialog";
import { StudentIDCard } from "@/components/portal/StudentIDCard";
import { generateIdCardPdf } from "@/lib/id-card-pdf";
import { playerKeys, fetchAthleteByStudent } from "@/lib/player-profile";
import { toast } from "sonner";
import { formatShortLocation } from "@/lib/location";


export const Route = createFileRoute("/student/profile")({
  component: StudentProfilePage,
});

function StudentProfilePage() {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");

  const ctxQ = useQuery({ queryKey: studentKeys.me, queryFn: fetchMyPortalContext });
  const ctx = ctxQ.data;
  const q = useQuery({
    queryKey: ctx ? studentKeys.profile(ctx.student_id) : ["student", "profile", "none"],
    queryFn: () => fetchStudentProfile(ctx!),
    enabled: !!ctx,
  });

  const athleteQ = useQuery({
    queryKey: playerKeys.athlete(ctx?.tenant_id || "", ctx?.student_id || ""),
    queryFn: () => fetchAthleteByStudent(ctx!.tenant_id, ctx!.student_id),
    enabled: !!ctx?.student_id,
  });

  const handleDownloadIDCard = async () => {
    if (!ctx) return;
    if (isDownloading) return; // Prevent multiple clicks during generation
    
    setIsDownloading(true);
    const downloadToast = toast.loading("Preparing your ID card...");
    
    try {
      // 1. Fetch tenant data in parallel with a small delay for UI responsiveness
      const [tenantRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("*")
          .eq("id", ctx.tenant_id)
          .single(),
        new Promise(resolve => setTimeout(resolve, 100))
      ]);
      
      const { data: tenant } = tenantRes;
      if (!tenant) throw new Error("Tenant not found");

      // 2. Generate PDF
      await generateIdCardPdf(tenant as any, {
        playerId: s.player_id ?? null,
        name: (s.name as string) || "Student",
        guardianName: (s.guardian_name as string) || (s.emergency_contact_name as string) || null,
        dob: (s.dob as string) || null,
        phone: (s.phone as string) || "",
        city: (s.city as string) || null,
        state: (s.state as string) || null,
        villageLocality: (s.village_locality as string) || null,
        guardianPhone: (s.guardian_phone as string) || (s.emergency_contact_phone as string) || null,
        batchName: (s.batches as any)?.name || (s.batch_name as string) || (s.playing_role as string) || "Student",
        batchTiming: (s.batches as any)?.timing || (s.batch_timing as string) || null,
        academyPhone: tenant.phone || null,
        academyName: tenant.name || null,
        academyLogo: tenant.logo_url || null,
        academyAddress: tenant.address || null,
        sport: (athleteQ.data?.primary_sport as string) || "Cricket",
        joinedAt: (s.joined_at as string) || new Date().toISOString(),
        photoPath: (s.photo_url as string) || null,
        cardToken: (s.card_token as string) || null,
      });
      
      toast.success("ID Card downloaded successfully", { id: downloadToast });
    } catch (err) {
      console.error("Failed to download ID card", err);
      toast.error("Failed to generate ID card", { id: downloadToast });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!ctx || q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const p = q.data!;
  const s = p.student as Record<string, string | null | undefined>;

  const items: { icon: React.ReactNode; label: string; value: string | null | undefined }[] = [
    { icon: <IdCard className="size-4" />, label: "Player ID", value: s.player_id },
    {
      icon: <Calendar className="size-4" />,
      label: "Joined",
      value: s.joined_at ? new Date(s.joined_at).toLocaleDateString() : null,
    },
    { icon: <UserCircle className="size-4" />, label: "Playing Role", value: s.playing_role },
    { icon: <UserCircle className="size-4" />, label: "Coach", value: s.coach_name },
    { icon: <Mail className="size-4" />, label: "Email", value: s.email },
    { icon: <Phone className="size-4" />, label: "Phone", value: s.phone },
    {
      icon: <Phone className="size-4" />,
      label: "Emergency Contact",
      value:
        s.emergency_contact_name || s.emergency_contact_phone
          ? `${s.emergency_contact_name ?? ""}${
              s.emergency_contact_phone ? " · " + s.emergency_contact_phone : ""
            }`
          : null,
    },
    { icon: <HeartPulse className="size-4" />, label: "Blood Group", value: s.blood_group },
    { icon: <HeartPulse className="size-4" />, label: "Medical Notes", value: s.medical_notes },
  ];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="p-5 flex items-center gap-4 bg-gradient-to-br from-primary/10 to-transparent">
        <PlayerPhotoUploader
          tenantId={ctx.tenant_id}
          studentId={ctx.student_id}
          photoUrl={(s.photo_url as string | null) ?? null}
          name={(s.name as string | null) ?? "Player"}
          size={64}
          onUpdated={() => {
            q.refetch();
            ctxQ.refetch(); // Ensure the global context (which has photo_url) also updates
          }}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{s.name}</h1>
          {s.player_id && <p className="text-xs text-muted-foreground">ID · {s.player_id}</p>}
          {s.playing_role && <p className="text-xs text-muted-foreground">{s.playing_role}</p>}
        </div>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => navigate({ to: "/student/timeline" })}
        >
          <CalendarDays className="size-4 mr-2" /> Timeline
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => navigate({ to: "/student/manage" })}
        >
          <Building2 className="size-4 mr-2" /> Manage
        </Button>
      </div>

      {/* ID Card section */}
      <section aria-label="ID Card">
        <div className="mb-2 px-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Student ID Card</p>
        </div>
        <Card className="p-4 flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IdCard className="size-5 text-primary" />
              <div className="flex flex-col">
                <h3 className="text-sm font-semibold">Official ID Card</h3>
                <p className="text-[10px] text-muted-foreground">Digital Identity for Academy</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-9 px-3 text-xs"
                onClick={handleDownloadIDCard}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="size-3.5 mr-2 animate-spin" />
                ) : (
                  <Download className="size-3.5 mr-2" />
                )}
                Download
              </Button>
            </div>
          </div>
          
          <div className="w-full pt-2">
            <Button
              variant="secondary"
              className="w-full h-11 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
              onClick={() => {
                const dialog = document.getElementById('id-card-preview-dialog') as any;
                if (dialog) dialog.showModal();
              }}
            >
              <Eye className="size-4 mr-2" /> View ID Card
            </Button>
          </div>
        </Card>

        {/* Minimal dialog-like preview using HTML <dialog> or a simple fixed overlay */}
        <dialog id="id-card-preview-dialog" className="bg-transparent backdrop:bg-black/60 p-0 rounded-2xl overflow-visible">
          <div className="bg-background max-w-[90vw] w-full p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-6 relative">
            <button 
              className="absolute -top-3 -right-3 size-10 bg-white dark:bg-slate-800 rounded-full shadow-lg border flex items-center justify-center z-50"
              onClick={() => {
                const dialog = document.getElementById('id-card-preview-dialog') as any;
                if (dialog) dialog.close();
              }}
            >
              <X className="size-5" />
            </button>

            <div className="flex bg-muted p-1 rounded-lg">
              <Button 
                size="sm" 
                variant={side === "front" ? "secondary" : "ghost"}
                className="h-8 px-4 text-xs"
                onClick={() => setSide("front")}
              >
                Front
              </Button>
              <Button 
                size="sm" 
                variant={side === "back" ? "secondary" : "ghost"}
                className="h-8 px-4 text-xs"
                onClick={() => setSide("back")}
              >
                Back
              </Button>
            </div>

            <div className="scale-[0.85] sm:scale-100 origin-top pointer-events-none select-none border rounded-2xl shadow-xl bg-background overflow-hidden mb-2">
              <StudentIDCard 
                side={side}
                student={{
                  name: (s.name as string) || "Student",
                  player_id: s.player_id,
                  photo_url: (s.photo_url as string) || null,
                  joined_at: s.joined_at,
                  dob: s.dob,
                  academy_name: ctx.tenant_name || "Cricket Academy OS",
                  academy_logo: ctx.tenant_logo || undefined,
                  academy_address: ctx.tenant_address || undefined,
                  academy_phone: ctx.tenant_phone || undefined,
                  sport: (athleteQ.data?.primary_sport as string) || "Cricket",
                  session: (s.batches as any)?.name || (s.batch_name as string) || undefined,
                  batch_timing: (s.batches as any)?.timing || (s.batch_timing as string) || undefined,
                  primary_color: ctx.tenant_primary_color || undefined,
                  phone: (s.phone as string) || undefined,
                }} 
              />
            </div>

            <Button 
              className="w-full h-12" 
              onClick={() => {
                handleDownloadIDCard();
                (document.getElementById('id-card-preview-dialog') as any)?.close();
              }}
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
              Download Official PDF
            </Button>
          </div>
        </dialog>
      </section>


      {/* Personal details */}
      <section aria-label="Personal details">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Personal Details</p>
          <EditMyProfileDialog student={s} onSaved={() => q.refetch()} />
        </div>
        <Card className="divide-y">

          {items
            .filter((i) => i.value)
            .map((i) => (
              <div key={i.label} className="p-3 flex items-center gap-3">
                <span className="text-muted-foreground">{i.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {i.label}
                  </p>
                  <p className="text-sm truncate">{i.value}</p>
                </div>
              </div>
            ))}
        </Card>
      </section>

      {/* Achievements */}
      {p.achievements.length > 0 && (
        <section aria-label="Achievements">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">
            Achievements
          </p>
          <div className="space-y-2">
            {p.achievements.slice(0, 10).map((a) => (
              <Card key={a.id} className="p-3 flex items-center gap-3">
                <div className="size-8 rounded-full bg-primary/10 grid place-items-center text-primary">
                  <Award className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  {a.event_date && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.event_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Awards */}
      {p.awards.length > 0 && (
        <section aria-label="Awards">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">Awards</p>
          <div className="space-y-2">
            {p.awards.slice(0, 10).map((a) => (
              <Card key={a.id} className="p-3 flex items-center gap-3">
                <div className="size-8 rounded-full bg-amber-500/15 grid place-items-center text-amber-600 dark:text-amber-400">
                  <Trophy className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  {a.event_date && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.event_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Future modules */}
      <section aria-label="Coming soon">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">
          Coming Soon
        </p>
        <Card className="p-4 text-sm text-muted-foreground flex items-center gap-3">
          <FileText className="size-4" />
          Documents & Certificates will appear here.
        </Card>
      </section>

      <AccountCard />

      <div className="pt-4 pb-12">
        <Button
          variant="outline"
          className="w-full h-12 text-destructive border-destructive/20 hover:bg-destructive/5"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>

    </div>
  );
}
