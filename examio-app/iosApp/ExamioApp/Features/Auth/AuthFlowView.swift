import SwiftUI

enum AuthRoute {
    case login
    case register
    case forgotPassword
    case resetPassword
}

struct AuthFlowView: View {
    @ObservedObject var viewModel: AuthViewModel
    @State private var route: AuthRoute = .login

    var body: some View {
        NavigationStack {
            switch route {
            case .login:
                LoginView(
                    viewModel: viewModel,
                    onRegister: { go(.register) },
                    onForgotPassword: { go(.forgotPassword) }
                )
            case .register:
                RegisterView(viewModel: viewModel, onLogin: { go(.login) })
            case .forgotPassword:
                ForgotPasswordView(
                    viewModel: viewModel,
                    onResetPassword: { go(.resetPassword) },
                    onLogin: { go(.login) }
                )
            case .resetPassword:
                ResetPasswordView(viewModel: viewModel, onLogin: { go(.login) })
            }
        }
        .tint(.examioPrimary)
        .onOpenURL { url in
            viewModel.completeOAuthCallback(url: url)
        }
    }

    private func go(_ nextRoute: AuthRoute) {
        viewModel.clearMessages()
        route = nextRoute
    }
}
