//
//  LoginView.swift
//  Transplant Platform - Patient Mobile App
//
//  Patient login form with HIPAA-compliant validation
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @EnvironmentObject private var appState: AppState
    
    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var rememberMe = false
    @State private var showingForgotPassword = false
    
    @FocusState private var focusedField: LoginField?
    
    private var isFormValid: Bool {
        !email.isEmpty && !password.isEmpty && isValidEmail(email)
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Form fields
                VStack(spacing: 20) {
                    // Email field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email Address")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.secondary)
                        
                        TextField("Enter your email", text: $email)
                            .textFieldStyle(CustomTextFieldStyle())
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .onSubmit {
                                focusedField = .password
                            }
                    }
                    
                    // Password field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Password")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.secondary)
                        
                        HStack {
                            Group {
                                if showPassword {
                                    TextField("Enter your password", text: $password)
                                } else {
                                    SecureField("Enter your password", text: $password)
                                }
                            }
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .onSubmit {
                                if isFormValid {
                                    Task {
                                        await signIn()
                                    }
                                }
                            }
                            
                            Button(action: {
                                showPassword.toggle()
                                HapticManager.shared.light()
                            }) {
                                Image(systemName: showPassword ? "eye.slash" : "eye")
                                    .foregroundColor(.secondary)
                                    .font(.system(size: 16))
                            }
                        }
                        .textFieldStyle(CustomTextFieldStyle())
                    }
                }
                
                // Options
                HStack {
                    // Remember me
                    Button(action: {
                        rememberMe.toggle()
                        HapticManager.shared.light()
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: rememberMe ? "checkmark.square.fill" : "square")
                                .foregroundColor(rememberMe ? Color(red: 0.2, green: 0.6, blue: 0.9) : .secondary)
                                .font(.system(size: 16))
                            
                            Text("Remember me")
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Spacer()
                    
                    // Forgot password
                    Button("Forgot Password?") {
                        showingForgotPassword = true
                        HapticManager.shared.light()
                    }
                    .font(.footnote)
                    .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                }
                
                // Sign in button
                Button(action: {
                    Task {
                        await signIn()
                    }
                }) {
                    HStack {
                        if authManager.isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        } else {
                            Text("Sign In")
                                .font(.headline)
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(isFormValid && !authManager.isLoading ? 
                                  Color(red: 0.2, green: 0.6, blue: 0.9) : 
                                  Color.gray.opacity(0.4))
                    )
                    .foregroundColor(.white)
                }
                .disabled(!isFormValid || authManager.isLoading)
                
                // Error display
                if let error = authManager.authError {
                    ErrorMessageView(message: error)
                }
                
                // Biometric login (if available)
                if BiometricManager.shared.isAvailable {
                    Button(action: {
                        Task {
                            await signInWithBiometrics()
                        }
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: BiometricManager.shared.biometricType.icon)
                                .font(.system(size: 20))
                            
                            Text("Sign in with \(BiometricManager.shared.biometricType.displayName)")
                                .font(.subheadline)
                                .fontWeight(.medium)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(red: 0.2, green: 0.6, blue: 0.9), lineWidth: 1.5)
                        )
                        .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                    }
                }
            }
            .padding(.horizontal, 20)
        }
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView()
        }
        .onAppear {
            // Load saved email if remember me was enabled
            if let savedEmail = UserDefaults.standard.string(forKey: "saved_email") {
                email = savedEmail
                rememberMe = true
            }
        }
    }
    
    // MARK: - Actions
    
    private func signIn() async {
        focusedField = nil
        
        // Save email if remember me is enabled
        if rememberMe {
            UserDefaults.standard.set(email, forKey: "saved_email")
        } else {
            UserDefaults.standard.removeObject(forKey: "saved_email")
        }
        
        let success = await authManager.signIn(email: email, password: password)
        
        if success {
            HapticManager.shared.success()
            // Clear password for security
            password = ""
        } else {
            HapticManager.shared.error()
        }
    }
    
    private func signInWithBiometrics() async {
        guard let savedEmail = UserDefaults.standard.string(forKey: "saved_email"),
              let savedCredentials = KeychainManager.shared.getSavedCredentials(for: savedEmail) else {
            appState.showError(.authenticationError("No saved credentials found"))
            return
        }
        
        let biometricResult = await BiometricManager.shared.authenticate(reason: "Sign in to your account")
        
        if biometricResult {
            email = savedEmail
            password = savedCredentials.password
            await signIn()
        }
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }
}

// MARK: - Supporting Views

struct CustomTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white)
                    .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
            )
    }
}

struct ErrorMessageView: View {
    let message: String
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
                .font(.system(size: 14))
            
            Text(message)
                .font(.footnote)
                .foregroundColor(.red)
                .multilineTextAlignment(.leading)
            
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.red.opacity(0.1))
        )
    }
}

// MARK: - Focus Fields

enum LoginField {
    case email
    case password
}

#Preview {
    LoginView()
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}