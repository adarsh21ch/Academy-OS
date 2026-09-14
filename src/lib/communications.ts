/**
 * Cricket Academy OS V2 — Communications (Phase 03.4).
 *
 * Campaign layer on top of the existing notification pipeline. Every campaign
 * fans out through `publish_notification` (server-side RPC) and reuses
 * `notifications` + `notification_outbox` + `notification_deliveries`.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;
import type { NotificationCategory, NotificationPriority } from "@/lib/notifications";

export type Channel = "in_app" | "push" | "email" | "whatsapp" | "sms";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";

export type AudienceKind = "all" | "students" | "parents" | "admins" | "batches" | "custom";

export type Audience = {
  kind: AudienceKind;
  batch_ids?: string[];
  student_ids?: string[];
  parent_ids?: string[];
  admin_ids?: string[];
  include_students?: boolean;
  include_parents?: boolean;
  include_admins?: boolean;
};

export type CommTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  category: NotificationCategory;
  title_template: string;
  body_template: string | null;
  default_channels: Channel[];
  variables_used: unknown;
  created_at: string;
  updated_at: string;
};

export type CommCampaign = {
  id: string;
  tenant_id: string;
  name: string;
  template_id: string | null;
  category: NotificationCategory;
  message_type: string;
  title: string;
  body: string | null;
  deep_link: string | null;
  priority: NotificationPriority;
  channels: Channel[];
  audience: Audience;
  status: CampaignStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_count: number;
  delivered_count: number;
  failed_count: number;
  is_recurring: boolean;
  recurrence_rule: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Merge-safe variable list for the composer helper chips. */
export const VARIABLES = [
  "student_name",
  "parent_name",
  "batch",
  "academy",
  "amount_due",
  "match_name",
  "date",
] as const;

export const MESSAGE_TYPES = [
  { value: "announcement", label: "Announcement" },
  { value: "reminder", label: "Reminder" },
  { value: "fee_reminder", label: "Fee Reminder", ownerOnly: true },
  { value: "match_reminder", label: "Match Reminder" },
  { value: "attendance_reminder", label: "Attendance Reminder" },
  { value: "trial_reminder", label: "Trial Reminder" },
  { value: "holiday", label: "Holiday Notice" },
  { value: "emergency", label: "Emergency" },
  { value: "general", label: "General" },
];

const rpc = supabase.rpc as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (t: string) => (supabase.from as any)(t);

export const commKeys = {
  campaigns: (tenantId: string) => ["comm", "campaigns", tenantId] as const,
  templates: (tenantId: string) => ["comm", "templates", tenantId] as const,
  recipients: (campaignId: string) => ["comm", "recipients", campaignId] as const,
};

export function campaignsQueryOptions(tenantId: string, db: Db = supabase) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromDb = (t: string) => (db.from as any)(t);
  return queryOptions({
    queryKey: commKeys.campaigns(tenantId),
    queryFn: async () => {
      const { data, error } = await fromDb("comm_campaigns")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as CommCampaign[];
    },
    staleTime: 15_000,
  });
}


export function templatesQueryOptions(tenantId: string) {
  return queryOptions({
    queryKey: commKeys.templates(tenantId),
    queryFn: async () => {
      const { data, error } = await from("comm_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommTemplate[];
    },
    staleTime: 30_000,
  });
}

export function useCampaigns(tenantId: string) {
  return useQuery(campaignsQueryOptions(tenantId));
}
export function useTemplates(tenantId: string) {
  return useQuery(templatesQueryOptions(tenantId));
}

export type CampaignInput = {
  tenant_id: string;
  name: string;
  template_id?: string | null;
  category: NotificationCategory;
  message_type: string;
  title: string;
  body?: string | null;
  deep_link?: string | null;
  priority?: NotificationPriority;
  channels: Channel[];
  audience: Audience;
  scheduled_for?: string | null;
};

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CampaignInput) => {
      const { data, error } = await from("comm_campaigns")
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          template_id: input.template_id ?? null,
          category: input.category,
          message_type: input.message_type,
          title: input.title,
          body: input.body ?? null,
          deep_link: input.deep_link ?? null,
          priority: input.priority ?? "normal",
          channels: input.channels,
          audience: input.audience as unknown as Record<string, unknown>,
          status: input.scheduled_for ? "scheduled" : "draft",
          scheduled_for: input.scheduled_for ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as CommCampaign;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: commKeys.campaigns(c.tenant_id) });
    },
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await rpc("send_campaign", { _campaign_id: campaignId });
      if (error) throw error;
      return data as { total: number; delivered: number; failed: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "campaigns"] }),
  });
}

export function useScheduleCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, when }: { id: string; when: string }) => {
      const { error } = await rpc("schedule_campaign", {
        _campaign_id: id,
        _when: when,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "campaigns"] }),
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc("cancel_campaign", { _campaign_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "campaigns"] }),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      t: Partial<CommTemplate> & {
        tenant_id: string;
        name: string;
        title_template: string;
        category: NotificationCategory;
      },
    ) => {
      if (t.id) {
        const { error } = await from("comm_templates")
          .update(t as never)
          .eq("id", t.id);
        if (error) throw error;
        return t.id;
      }
      const { data, error } = await from("comm_templates")
        .insert(t as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_id, vars) =>
      qc.invalidateQueries({ queryKey: commKeys.templates(vars.tenant_id) }),
  });
}

export function useDeleteTemplate(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await from("comm_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commKeys.templates(tenantId) }),
  });
}

export function statusTone(s: CampaignStatus): { label: string; className: string } {
  switch (s) {
    case "sent":
      return {
        label: "Sent",
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "sending":
      return { label: "Sending", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" };
    case "scheduled":
      return {
        label: "Scheduled",
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "failed":
      return { label: "Failed", className: "bg-rose-500/10 text-rose-700 dark:text-rose-400" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground" };
    default:
      return { label: "Draft", className: "bg-muted text-muted-foreground" };
  }
}

export function audienceLabel(a: Audience): string {
  switch (a.kind) {
    case "all":
      return "Entire academy";
    case "students":
      return "All students";
    case "parents":
      return "All parents";
    case "admins":
      return "All staff";
    case "batches":
      return `${a.batch_ids?.length ?? 0} batch(es)`;
    case "custom": {
      const bits: string[] = [];
      if (a.student_ids?.length) bits.push(`${a.student_ids.length} students`);
      if (a.parent_ids?.length) bits.push(`${a.parent_ids.length} parents`);
      if (a.admin_ids?.length) bits.push(`${a.admin_ids.length} staff`);
      return bits.join(" + ") || "Custom (empty)";
    }
    default:
      return "Audience";
  }
}
