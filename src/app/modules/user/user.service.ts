/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { JwtPayload } from "jsonwebtoken";
import config from "../../config";
import registrationSuccessEmailBody from "../../emailBody/registerSuccessEmail";
import AppError from "../../error/appError";
import { prisma } from "../../utils/prisma";
import sendEmail from "../../utils/sendEmail";
import { USER_ROLE } from "./user.constant";
import { TUserRole } from "./user.interface";
import { createToken } from "./user.utils";

const generateVerifyCode = (): number => {
  return Math.floor(100000 + Math.random() * 900000);
};

const registerUser = async (payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: Date;
  address?: string;
  recommendedUsers?: any[];
}) => {
  const { password, confirmPassword, recommendedUsers, ...userData } = payload;

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Password and confirm password doesn't match");
  }

  const isUserExists = await prisma.user.findUnique({ where: { email: userData.email } });
  if (isUserExists) {
    throw new AppError(httpStatus.BAD_REQUEST, "This email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verifyCode = generateVerifyCode();

  // Transaction: create User + NormalUser + RecommendedUsers
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: userData.email,
        password: hashedPassword,
        role: UserRole.user,
        verifyCode,
        codeExpireIn: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const normalUser = await tx.normalUser.create({
      data: {
        userId: user.id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone || "",
        gender: userData.gender,
        dateOfBirth: userData.dateOfBirth,
        address: userData.address,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { profileId: normalUser.id },
    });

    return normalUser;
  });

  // Send email outside transaction
  sendEmail({
    email: payload.email,
    subject: "Activate Your Account",
    html: registrationSuccessEmailBody(result.name, verifyCode),
  });

  return result;
};

const verifyCode = async (email: string, verifyCode: number) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");
  if (!user.codeExpireIn || user.codeExpireIn < new Date())
    throw new AppError(httpStatus.BAD_REQUEST, "Verify code is expired");
  if (user.verifyCode !== verifyCode)
    throw new AppError(httpStatus.BAD_REQUEST, "Code doesn't match");

  const updatedUser = await prisma.user.update({
    where: { email },
    data: { isVerified: true },
  });

  const jwtPayload = {
    id: updatedUser.id,
    profileId: updatedUser.profileId as string,
    email: updatedUser.email,
    role: updatedUser.role as TUserRole,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string
  );
  const refreshToken = createToken(
    jwtPayload,
    config.jwt_refresh_secret as string,
    config.jwt_refresh_expires_in as string
  );

  return { accessToken, refreshToken };
};

const resendVerifyCode = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const verifyCode = generateVerifyCode();

  await prisma.user.update({
    where: { email },
    data: { verifyCode, codeExpireIn: new Date(Date.now() + 5 * 60 * 1000) },
  });

  await sendEmail({
    email,
    subject: "Activate Your Account",
    html: registrationSuccessEmailBody("Dear", verifyCode),
  });

  return null;
};

const deleteUserAccount = async (userPayload: JwtPayload, password: string) => {
  const user = await prisma.user.findUnique({ where: { id: userPayload.id } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError(httpStatus.FORBIDDEN, "Password do not match");

  await prisma.$transaction(async (tx) => {
    if (user.profileId) {
      await tx.normalUser.delete({ where: { id: user.profileId } });
    }
    await tx.user.delete({ where: { id: user.id } });
  });

  return null;
};

const getMyProfile = async (userData: JwtPayload) => {
  if (userData.role === USER_ROLE.user) {
    return prisma.normalUser.findUnique({ where: { email: userData.email } });
  }
  if (userData.role === USER_ROLE.admin) {
    return prisma.admin.findUnique({ where: { email: userData.email } });
  }
  if (userData.role === USER_ROLE.superAdmin) {
    return prisma.superAdmin.findUnique({ where: { email: userData.email } });
  }
  return null;
};

const changeUserStatus = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { isBlocked: !user.isBlocked },
  });

  return updatedUser;
};

export const userServices = {
  registerUser,
  verifyCode,
  resendVerifyCode,
  deleteUserAccount,
  getMyProfile,
  changeUserStatus,
};
