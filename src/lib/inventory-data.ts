import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import type {
  Material,
  MaterialMovement,
  MovementKind,
  OrderMaterial,
  RentalDress,
  RentalRecord,
} from "./inventory";

const BUCKET = "inventory";

/* ================= صور المخزون ================= */

export function useInventoryUrls(paths: (string | null | undefined)[]) {
  const clean = paths.filter((p): p is string => Boolean(p));
  const key = clean.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(list, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        data.forEach((row) => {
          if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
        });
        setUrls(next);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}

async function uploadImage(file: File, folder: string) {
  const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

/* ================= مخزون المواد ================= */

export function useMaterials() {
  return useQuery({
    queryKey: ["materials"],
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase.from("materials").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: ["material", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Material | null;
    },
  });
}

export function useMaterialMovements(materialId?: string) {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["movements", materialId ?? "all", branchId],
    queryFn: async (): Promise<MaterialMovement[]> => {
      let q = supabase.from("material_movements").select("*").order("created_at", { ascending: false });
      if (materialId) q = q.eq("material_id", materialId);
      if (branchId !== ALL_BRANCHES) q = q.eq("branch_id", branchId);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

type MaterialInput = {
  name: string;
  category: string;
  unit: string;
  min_qty: number;
  unit_cost: number;
  supplier: string | null;
  notes: string | null;
  image?: File | null;
  opening_qty?: number;
};

export function useSaveMaterial() {
  const qc = useQueryClient();
  const { writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async ({ id, ...input }: MaterialInput & { id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const image_path = input.image ? await uploadImage(input.image, "materials") : undefined;
      const payload = {
        name: input.name,
        category: input.category,
        unit: input.unit,
        min_qty: input.min_qty,
        unit_cost: input.unit_cost,
        supplier: input.supplier,
        notes: input.notes,
        ...(image_path ? { image_path } : {}),
      };

      if (id) {
        const { error } = await supabase.from("materials").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }

      const { data, error } = await supabase
        .from("materials")
        .insert({ ...payload, created_by: uid })
        .select("id")
        .single();
      if (error) throw error;

      if (input.opening_qty && input.opening_qty > 0) {
        const mv = await supabase.from("material_movements").insert({
          material_id: data.id,
          kind: "in" as MovementKind,
          qty: input.opening_qty,
          notes: "رصيد افتتاحي",
          branch_id: writeBranchId,
          created_by: uid,
        });
        if (mv.error) throw mv.error;
      }
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["material-stock"] });
    },
  });
}

export function useAddMovement() {
  const qc = useQueryClient();
  const { writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: {
      material_id: string;
      kind: MovementKind;
      qty: number;
      order_id?: string | null;
      notes?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("material_movements").insert({
        material_id: input.material_id,
        kind: input.kind,
        qty: input.qty,
        order_id: input.order_id ?? null,
        notes: input.notes ?? null,
        branch_id: writeBranchId,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["material-stock"] });
      qc.invalidateQueries({ queryKey: ["order-materials"] });
    },
  });
}

/* ================= مواد الطلب: حجز وصرف ================= */

export function useOrderMaterials(orderId: string) {
  return useQuery({
    queryKey: ["order-materials", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderMaterial[]> => {
      const { data, error } = await supabase
        .from("order_materials")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** يحجز كمية مادة على طلب: يسجل حركة حجز ويحدّث سجل مواد الطلب */
export function useReserveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      materialId,
      qty,
      notes,
    }: {
      orderId: string;
      materialId: string;
      qty: number;
      notes?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const existing = await supabase
        .from("order_materials")
        .select("*")
        .eq("order_id", orderId)
        .eq("material_id", materialId)
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (existing.data) {
        const { error } = await supabase
          .from("order_materials")
          .update({ qty_reserved: Number(existing.data.qty_reserved) + qty, notes: notes ?? existing.data.notes })
          .eq("id", existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("order_materials").insert({
          order_id: orderId,
          material_id: materialId,
          qty_reserved: qty,
          notes: notes ?? null,
          created_by: uid,
        });
        if (error) throw error;
      }

      const mv = await supabase.from("material_movements").insert({
        material_id: materialId,
        order_id: orderId,
        kind: "reserve" as MovementKind,
        qty,
        notes: notes ?? null,
        created_by: uid,
      });
      if (mv.error) throw mv.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["order-materials"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

/** يصرف كمية محجوزة فعليًا من المخزون */
export function useIssueMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, qty }: { row: OrderMaterial; qty: number }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const { error } = await supabase
        .from("order_materials")
        .update({
          qty_issued: Number(row.qty_issued) + qty,
          qty_reserved: Math.max(0, Number(row.qty_reserved) - qty),
        })
        .eq("id", row.id);
      if (error) throw error;

      const mv = await supabase.from("material_movements").insert({
        material_id: row.material_id,
        order_id: row.order_id,
        kind: "out" as MovementKind,
        qty,
        notes: "صرف على الطلب",
        created_by: uid,
      });
      if (mv.error) throw mv.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["order-materials"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

/** يحرّر الحجز المتبقي لمادة على طلب */
export function useReleaseMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: OrderMaterial) => {
      const amount = Number(row.qty_reserved);
      if (amount <= 0) return;
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("order_materials")
        .update({ qty_reserved: 0 })
        .eq("id", row.id);
      if (error) throw error;

      const mv = await supabase.from("material_movements").insert({
        material_id: row.material_id,
        order_id: row.order_id,
        kind: "release" as MovementKind,
        qty: amount,
        notes: "تحرير حجز",
        created_by: userData.user?.id ?? null,
      });
      if (mv.error) throw mv.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["order-materials"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

/* ================= فساتين الإيجار ================= */

export function useRentalDresses() {
  return useQuery({
    queryKey: ["rental-dresses"],
    queryFn: async (): Promise<RentalDress[]> => {
      const { data, error } = await supabase.from("rental_dresses").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRentalDress(id: string) {
  return useQuery({
    queryKey: ["rental-dress", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_dresses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as RentalDress | null;
    },
  });
}

export function useRentalRecords(dressId?: string) {
  return useQuery({
    queryKey: ["rental-records", dressId ?? "all"],
    queryFn: async (): Promise<RentalRecord[]> => {
      let q = supabase.from("rental_records").select("*").order("out_date", { ascending: false });
      if (dressId) q = q.eq("dress_id", dressId);
      const { data, error } = await q.limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveDress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      image,
      ...input
    }: {
      id?: string;
      code: string;
      model_no: string | null;
      size: string | null;
      color: string | null;
      rent_price: number;
      deposit_amount: number;
      status: RentalDress["status"];
      notes: string | null;
      image?: File | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const image_path = image ? await uploadImage(image, "dresses") : undefined;
      const payload = { ...input, ...(image_path ? { image_path } : {}) };

      if (id) {
        const { error } = await supabase.from("rental_dresses").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("rental_dresses")
        .insert({ ...payload, created_by: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}

export function useSetDressStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RentalDress["status"] }) => {
      const { error } = await supabase.from("rental_dresses").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}

export function useStartRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      dress_id: string;
      client_name: string;
      client_phone: string | null;
      out_date: string;
      due_date: string;
      amount: number;
      deposit_amount: number;
      notes: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("rental_records")
        .insert({ ...input, created_by: userData.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-records"] });
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}

export function useReturnRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      returned_at: string;
      return_condition: string;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from("rental_records")
        .update({
          returned_at: input.returned_at,
          return_condition: input.return_condition,
          ...(input.notes ? { notes: input.notes } : {}),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-records"] });
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}
