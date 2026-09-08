import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDb } from "../db";

/** Named, reusable Finish subchains (Finish 2 D5), app-wide. */
export type RecipeRow = {
  id: number;
  name: string;
  nodes_json: string;
  created_at: string;
};

export function useRecipes() {
  return useQuery({
    queryKey: ["recipes"],
    queryFn: async (): Promise<RecipeRow[]> => {
      const db = await getDb();
      return db.select<RecipeRow[]>("SELECT * FROM recipes ORDER BY name");
    },
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, nodesJson }: { name: string; nodesJson: string }) => {
      const db = await getDb();
      await db.execute("INSERT INTO recipes (name, nodes_json) VALUES ($1, $2)", [
        name,
        nodesJson,
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const db = await getDb();
      await db.execute("DELETE FROM recipes WHERE id = $1", [id]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });
}
