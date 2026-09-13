import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { WhatsappTemplate } from "./whatsapp";

const key = ["whatsapp-templates"] as const;

export function useWhatsappTemplates() {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<WhatsappTemplate[]> => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveWhatsappTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      label?: string;
      body?: string;
      is_active?: boolean;
    }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("whatsapp_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** يسجّل إرسال رسالة واتساب في سجل النشاط */
export function useLogWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId?: string | null; label: string; to: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("activity_log").insert({
        order_id: input.orderId ?? null,
        actor_id: auth.user?.id ?? null,
        action: "whatsapp_sent",
        details: `${input.label} → ${input.to}`,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      if (v.orderId) qc.invalidateQueries({ queryKey: ["activity", v.orderId] });
    },
  });
}
