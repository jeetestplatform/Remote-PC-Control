import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { authenticatedFetch } from "@/lib/fetch";
import { z } from "zod";

export function useDevices() {
  return useQuery({
    queryKey: [api.devices.list.path],
    queryFn: async () => {
      const data = await authenticatedFetch(api.devices.list.path);
      return api.devices.list.responses[200].parse(data);
    }
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.devices.create.input>) => {
      const response = await authenticatedFetch(api.devices.create.path, {
        method: api.devices.create.method,
        body: JSON.stringify(data),
      });
      return api.devices.create.responses[201].parse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.devices.list.path] });
    }
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.devices.delete.path, { id });
      await authenticatedFetch(url, {
        method: api.devices.delete.method,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.devices.list.path] });
    }
  });
}
