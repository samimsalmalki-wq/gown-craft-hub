import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Model = Database["public"]["Tables"]["models"]["Row"];
export type ModelImage = Database["public"]["Tables"]["model_images"]["Row"];
export type ModelMaterial = Database["public"]["Tables"]["model_materials"]["Row"];

const BUCKET = "inventory";

export type ModelInput = {
  code: string;
  name: string;
  item_type_id: string | null;
  est_price: number;
  description: string | null;
  notes: string | null;
  is_active?: boolean;
};

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async (): Promise<Model[]> => {
      const { data, error } = await supabase.from("models").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useModel(id: string) {
  return useQuery({
    queryKey: ["model", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Model | null> => {
      const { data, error } = await supabase.from("models").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ModelInput & { id?: string }) => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code) throw new Error("اكتب رقم الموديل");
      if (!name) throw new Error("اكتب اسم الموديل");
      const payload = { ...input, code, name };
      if (id) {
        const { error } = await supabase.from("models").update(payload).eq("id", id);
        if (error) throw translate(error);
        return id;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("models")
        .insert({ ...payload, created_by: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw translate(error);
      return data.id;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["models"] });
      if (vars.id) qc.invalidateQueries({ queryKey: ["model", vars.id] });
    },
  });
}

function translate(error: { code?: string; message: string }) {
  if (error.code === "23505" || error.message.includes("models_code_key")) {
    return new Error("رقم الموديل مستخدم في موديل آخر");
  }
  return new Error(error.message);
}

/* ================= مواد الموديل ================= */

export function useModelMaterials(modelId?: string | null) {
  return useQuery({
    queryKey: ["model-materials", modelId ?? "none"],
    enabled: Boolean(modelId),
    queryFn: async (): Promise<ModelMaterial[]> => {
      const { data, error } = await supabase
        .from("model_materials")
        .select("*")
        .eq("model_id", modelId as string);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** عدد المواد لكل موديل — لعرضه في القائمة */
export function useModelMaterialCounts() {
  return useQuery({
    queryKey: ["model-material-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("model_materials").select("model_id");
      if (error) throw error;
      const out: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        out[r.model_id] = (out[r.model_id] ?? 0) + 1;
      });
      return out;
    },
  });
}

export function useSetModelMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      materialId,
      qty,
    }: {
      modelId: string;
      materialId: string;
      qty: number;
    }) => {
      if (!materialId) throw new Error("اختر المادة");
      if (!(qty > 0)) throw new Error("اكتب كمية أكبر من صفر");
      const { error } = await supabase
        .from("model_materials")
        .upsert({ model_id: modelId, material_id: materialId, qty }, { onConflict: "model_id,material_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["model-materials", vars.modelId] });
      qc.invalidateQueries({ queryKey: ["model-material-counts"] });
    },
  });
}

export function useRemoveModelMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; modelId: string }) => {
      const { error } = await supabase.from("model_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["model-materials", vars.modelId] });
      qc.invalidateQueries({ queryKey: ["model-material-counts"] });
    },
  });
}

/* ================= صور الموديل ================= */

export function useModelImages(modelId?: string | null) {
  return useQuery({
    queryKey: ["model-images", modelId ?? "none"],
    enabled: Boolean(modelId),
    queryFn: async (): Promise<ModelImage[]> => {
      const { data, error } = await supabase
        .from("model_images")
        .select("*")
        .eq("model_id", modelId as string)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** أول صورة لكل موديل — للقائمة */
export function useModelCovers() {
  return useQuery({
    queryKey: ["model-covers"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("model_images")
        .select("model_id, storage_path, position")
        .order("position");
      if (error) throw error;
      const out: Record<string, string> = {};
      (data ?? []).forEach((r) => {
        if (!out[r.model_id]) out[r.model_id] = r.storage_path;
      });
      return out;
    },
  });
}

export function useUploadModelImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ modelId, files }: { modelId: string; files: File[] }) => {
      const { data: existing } = await supabase
        .from("model_images")
        .select("position")
        .eq("model_id", modelId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      let pos = (existing?.position ?? 0) + 1;
      for (const file of files) {
        const path = `models/${modelId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file);
        if (up.error) throw up.error;
        const ins = await supabase
          .from("model_images")
          .insert({ model_id: modelId, storage_path: path, position: pos });
        if (ins.error) throw ins.error;
        pos += 1;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["model-images", vars.modelId] });
      qc.invalidateQueries({ queryKey: ["model-covers"] });
    },
  });
}

export function useDeleteModelImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string; modelId: string }) => {
      const { error } = await supabase.from("model_images").delete().eq("id", id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([path]);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["model-images", vars.modelId] });
      qc.invalidateQueries({ queryKey: ["model-covers"] });
    },
  });
}
