import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import normalUserValidations from "../normalUser/normalUser.validation";
import { USER_ROLE } from "../user/user.constant";
import { userController } from "../user/user.controller";
import userValidations from "../user/user.validation";

const router = Router();

router.post(
  "/sign-up",
  validateRequest(normalUserValidations.createNormalUserSchema),
  userController.registerUser
);

router.post(
  "/verify-code",
  validateRequest(userValidations.verifyCodeValidationSchema),
  userController.verifyCode
);

router.post(
  "/resend-verify-code",
  validateRequest(userValidations.resendVerifyCodeSchema),
  userController.resendVerifyCode
);

router.get(
  "/get-my-profile",
  auth(USER_ROLE.user, USER_ROLE.admin, USER_ROLE.superAdmin),
  userController.getMyProfile
);

router.patch("/block-unblock/:id", auth(USER_ROLE.superAdmin), userController.changeUserStatus);

router.delete(
  "/delete-account",
  auth(USER_ROLE.user),
  validateRequest(userValidations.deleteUserAccountValidationSchema),
  userController.deleteUserAccount
);

export const userRoutes = router;
