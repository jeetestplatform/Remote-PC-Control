import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { authenticatedFetch } from "@/lib/fetch";
import { z } from "zod";

export function usePairings() {
  return useQuery({
    queryKey: [api.pairings.list.path],
    queryFn: async () => {
      const data = await authenticatedFetch(api.pairings.list.path);
      return api.pairings.list.responses[200].parse(data);
    }
  });
}

export function useCreatePairing() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.pairings.create.input>) => {
      const response = await authenticatedFetch(api.pairings.create.path, {
        method: api.pairings.create.method,
        body: JSON.stringify(data),
      });
      return api.pairings.create.responses[201].parse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.pairings.list.path] });
    }
  });
}
