export type TLoginUser = {
  email: string;
  password: string;
};
export interface ILoginWithGoogle {
  name: string;
  email: string;
  profile_image?: string;
  phone?: string;
}
