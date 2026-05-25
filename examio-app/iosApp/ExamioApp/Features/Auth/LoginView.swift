import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: AuthViewModel
    let onRegister: () -> Void
    let onForgotPassword: () -> Void

    @Environment(\.openURL) private var openURL
    @State private var credential = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 1.0, green: 0.97, blue: 0.93),
                    Color.examioCanvas,
                    Color.examioCard,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.examioPrimary.opacity(0.16))
                .frame(width: 180, height: 180)
                .blur(radius: 2)
                .offset(x: -120, y: -280)

            Circle()
                .fill(Color(red: 0.95, green: 0.71, blue: 0.43).opacity(0.18))
                .frame(width: 240, height: 240)
                .blur(radius: 4)
                .offset(x: 140, y: 290)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    brandHeader
                    loginCard
                }
                .frame(maxWidth: 430)
                .padding(.horizontal, 20)
                .padding(.vertical, 36)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var brandHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.examioPrimary.opacity(0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.examioPrimary.opacity(0.25), lineWidth: 1)
                    )
                Image("ExamioLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .frame(width: 78, height: 78)
            .shadow(color: Color.examioPrimary.opacity(0.12), radius: 18, x: 0, y: 10)

            Label("Nền tảng học tập cùng AI", systemImage: "sparkles")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }

    private var loginCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Chào Mừng Trở Lại")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.examioInk)
                Text("Đăng nhập vào Examio để tiếp tục học, luyện đề và quản lý tài liệu.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 4)

            iconTextField(
                title: "Tên Đăng Nhập hoặc Email",
                systemImage: "envelope",
                text: $credential
            )
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            iconSecureField(
                title: "Mật Khẩu",
                systemImage: "lock",
                text: $password
            )

            HStack {
                Spacer()
                Button("Quên mật khẩu?", action: onForgotPassword)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color.examioPrimary)
            }

            AuthMessageView(error: viewModel.errorMessage, success: viewModel.successMessage)

            Button {
                viewModel.login(credential: credential.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
            } label: {
                Text(viewModel.isLoading ? "Đang xử lý..." : "Đăng Nhập")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.examioPrimary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: Color.examioPrimary.opacity(0.28), radius: 16, x: 0, y: 8)
            }
            .disabled(viewModel.isLoading || credential.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.count < 6)

            divider

            Button {
                openGoogleLogin()
            } label: {
                HStack(spacing: 10) {
                    Text("G")
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.26, green: 0.52, blue: 0.96))
                    Text("Google")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.examioInk.opacity(0.82))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color(red: 0.89, green: 0.84, blue: 0.79), lineWidth: 1)
                )
            }

            HStack(spacing: 4) {
                Text("Bạn chưa có tài khoản?")
                    .foregroundStyle(.secondary)
                Button("Đăng ký ngay", action: onRegister)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.examioPrimary)
            }
            .font(.footnote)
            .frame(maxWidth: .infinity)
            .padding(.top, 2)
        }
        .padding(22)
        .background(Color.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color(red: 0.91, green: 0.84, blue: 0.78), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 24, x: 0, y: 14)
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Color(red: 0.89, green: 0.84, blue: 0.79)).frame(height: 1)
            Text("Hoặc tiếp tục với")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize()
            Rectangle().fill(Color(red: 0.89, green: 0.84, blue: 0.79)).frame(height: 1)
        }
        .padding(.vertical, 2)
    }

    private func iconTextField(title: String, systemImage: String, text: Binding<String>) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(Color.examioPrimary)
                .frame(width: 20)
            TextField(title, text: text)
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(Color(red: 0.99, green: 0.97, blue: 0.94), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(red: 0.89, green: 0.84, blue: 0.79), lineWidth: 1)
        )
    }

    private func iconSecureField(title: String, systemImage: String, text: Binding<String>) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(Color.examioPrimary)
                .frame(width: 20)
            SecureField(title, text: text)
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(Color(red: 0.99, green: 0.97, blue: 0.94), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(red: 0.89, green: 0.84, blue: 0.79), lineWidth: 1)
        )
    }

    private func openGoogleLogin() {
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "ExamioAPIBaseURL") as? String ?? "http://localhost:3000"
        var components = URLComponents(string: baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/v1/auth/google")
        components?.queryItems = [URLQueryItem(name: "redirect", value: "examio://auth/callback")]
        if let url = components?.url {
            openURL(url)
        }
    }
}
