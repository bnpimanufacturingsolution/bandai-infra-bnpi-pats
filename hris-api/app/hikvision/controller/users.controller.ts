import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../../generated/prisma";
import { buildSuccessResponse } from "../../../helper/success-handler.helper";
import { buildErrorResponse } from "../../../helper/error-handler";
import { hikvisionEndpoint } from "../../../config/hikvision.endpoint";
import { hikvisionFetch } from "../../../lib/hikvision-client";

export const controller = (prisma: PrismaClient) => {
	const fetchFromDevice = (
		req: Request,
		endpoint: string,
		options: Parameters<typeof hikvisionFetch>[1] = {},
	) => hikvisionFetch(endpoint, { ...options, prisma, request: req });
	return {
		// List all users from Hikvision device
		listUsers: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, hikvisionEndpoint.security.users.list);

				return res
					.status(200)
					.json(buildSuccessResponse("Users retrieved successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve users",
							error.status || 500,
						),
					);
			}
		},

		// Get user by ID from Hikvision device
		getUserById: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, hikvisionEndpoint.security.users.detail(id));

				return res
					.status(200)
					.json(buildSuccessResponse("User retrieved successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve user",
							error.status || 500,
						),
					);
			}
		},

		// Create a new user on Hikvision device
		createUser: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const userData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.security.users.create, {
					method: "POST",
					body: userData,
				});

				return res
					.status(201)
					.json(buildSuccessResponse("User created successfully", data, 201));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to create user",
							error.status || 500,
						),
					);
			}
		},

		// Update user on Hikvision device
		updateUser: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;
				const userData = req.body;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, hikvisionEndpoint.security.users.update(id), {
					method: "PUT",
					body: userData,
				});

				return res
					.status(200)
					.json(buildSuccessResponse("User updated successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update user",
							error.status || 500,
						),
					);
			}
		},

		// Delete user from Hikvision device
		deleteUser: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, hikvisionEndpoint.security.users.delete(id), {
					method: "DELETE",
				});

				return res
					.status(200)
					.json(buildSuccessResponse("User deleted successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to delete user",
							error.status || 500,
						),
					);
			}
		},

		// Check user on Hikvision device (digest authentication check)
		checkUser: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, hikvisionEndpoint.security.userCheck);

				return res
					.status(200)
					.json(buildSuccessResponse("User check completed successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to check user",
							error.status || 500,
						),
					);
			}
		},

		// Get user permissions
		getUserPermissions: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.detail(id),
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse("User permissions retrieved successfully", data, 200),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve user permissions",
							error.status || 500,
						),
					);
			}
		},

		// Get user local permissions
		getUserLocalPermission: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.localPermission(id),
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User local permissions retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve user local permissions",
							error.status || 500,
						),
					);
			}
		},

		// Get user remote permissions
		getUserRemotePermission: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.remotePermission(id),
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User remote permissions retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve user remote permissions",
							error.status || 500,
						),
					);
			}
		},

		// Get permission capabilities (admin, operator, viewer)
		getAdminCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.adminCap,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Admin capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve admin capabilities",
							error.status || 500,
						),
					);
			}
		},

		getOperatorCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.operatorCap,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Operator capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve operator capabilities",
							error.status || 500,
						),
					);
			}
		},

		getViewerCapabilities: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.viewerCap,
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"Viewer capabilities retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve viewer capabilities",
							error.status || 500,
						),
					);
			}
		},

		// List all user permissions
		listUserPermissions: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = await fetchFromDevice(req, hikvisionEndpoint.security.userPermission.list);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User permissions list retrieved successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to retrieve user permissions list",
							error.status || 500,
						),
					);
			}
		},

		// Update user permissions list
		updateUserPermissions: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const permissionsData = req.body;

				const data = await fetchFromDevice(req, hikvisionEndpoint.security.userPermission.list, {
					method: "PUT",
					body: permissionsData,
				});

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User permissions list updated successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update user permissions list",
							error.status || 500,
						),
					);
			}
		},

		// Update user permission by ID
		updateUserPermissionById: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;
				const permissionData = req.body;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.detail(id),
					{
						method: "PUT",
						body: permissionData,
					},
				);

				return res
					.status(200)
					.json(buildSuccessResponse("User permission updated successfully", data, 200));
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update user permission",
							error.status || 500,
						),
					);
			}
		},

		// Update user local permission
		updateUserLocalPermission: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;
				const localPermissionData = req.body;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.localPermission(id),
					{
						method: "PUT",
						body: localPermissionData,
					},
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User local permission updated successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update user local permission",
							error.status || 500,
						),
					);
			}
		},

		// Update user remote permission
		updateUserRemotePermission: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { id } = req.params;
				const remotePermissionData = req.body;

				if (!id) {
					return res.status(400).json(buildErrorResponse("User ID is required", 400));
				}

				const data = await fetchFromDevice(req, 
					hikvisionEndpoint.security.userPermission.remotePermission(id),
					{
						method: "PUT",
						body: remotePermissionData,
					},
				);

				return res
					.status(200)
					.json(
						buildSuccessResponse(
							"User remote permission updated successfully",
							data,
							200,
						),
					);
			} catch (error: any) {
				return res
					.status(error.status || 500)
					.json(
						buildErrorResponse(
							error.message || "Failed to update user remote permission",
							error.status || 500,
						),
					);
			}
		},
	};
};

