import { useQuery } from "@tanstack/react-query";
import userService from "~/services/user.service";

export const useUsers = () => {
	return useQuery({
		queryKey: ["users"],
		queryFn: async () => {
			const response = await userService.getUsers();
			// Handle different response formats
			if (Array.isArray(response.data)) {
				return response.data;
			}
			if (response.data && "users" in response.data && Array.isArray(response.data.users)) {
				return response.data.users;
			}
			return [];
		},
	});
};
