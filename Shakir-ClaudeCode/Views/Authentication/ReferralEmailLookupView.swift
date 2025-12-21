//
//  ReferralEmailLookupView.swift
//  Transplant Platform - Patient Mobile App
//
//  Screen for users to enter their email to look up their referral
//

import SwiftUI

struct ReferralEmailLookupView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var showReferralFlow: Bool
    @Binding var referralData: ReferralLookupData?

    @State private var email = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showError = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(spacing: 16) {
                Image(systemName: "envelope.badge.person.crop")
                    .font(.system(size: 60))
                    .foregroundColor(.white)

                Text("Find Your Referral")
                    .font(.title)
                    .fontWeight(.light)
                    .foregroundColor(.white)

                Text("Enter the email your social worker used")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.9))
            }
            .padding(.top, 60)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.4, green: 0.5, blue: 0.92),
                        Color(red: 0.46, green: 0.3, blue: 0.64)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            // Content
            ScrollView {
                VStack(spacing: 24) {
                    // Instructions
                    VStack(spacing: 12) {
                        Text("Enter Your Email Address")
                            .font(.headline)
                            .foregroundColor(.primary)

                        Text("This should be the email address that your dialysis social worker used when they referred you.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 30)
                    .padding(.horizontal, 20)

                    // Email Input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email Address")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)

                        TextField("your.email@example.com", text: $email)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .background(Color(.systemGray6))
                            .cornerRadius(10)
                    }
                    .padding(.horizontal, 20)

                    // Error Message
                    if showError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                            Text(errorMessage)
                                .font(.subheadline)
                                .foregroundColor(.red)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                        .padding(.horizontal, 20)
                    }

                    // Lookup Button
                    Button(action: lookupReferral) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.9)
                            } else {
                                Image(systemName: "magnifyingglass")
                                Text("Find My Referral")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color(red: 0.4, green: 0.5, blue: 0.92),
                                    Color(red: 0.46, green: 0.3, blue: 0.64)
                                ]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(email.isEmpty || isLoading)
                    .opacity(email.isEmpty ? 0.6 : 1.0)
                    .padding(.horizontal, 20)

                    // Back Button
                    Button(action: {
                        showReferralFlow = false
                    }) {
                        Text("Go Back")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 10)

                    Spacer(minLength: 50)
                }
            }
            .background(Color(.systemBackground))
        }
        .edgesIgnoringSafeArea(.top)
        .onTapGesture {
            hideKeyboard()
        }
    }

    private func lookupReferral() {
        guard !email.isEmpty else { return }
        guard isValidEmail(email) else {
            errorMessage = "Please enter a valid email address"
            showError = true
            return
        }

        isLoading = true
        showError = false

        Task {
            do {
                let result = try await APIService.shared.lookupReferralByEmail(email: email.lowercased().trimmingCharacters(in: .whitespaces))

                await MainActor.run {
                    isLoading = false
                    if let data = result {
                        // Found referral - store data and proceed
                        referralData = data
                        HapticManager.shared.success()
                    } else {
                        errorMessage = "No referral found for this email address. Please check your email or contact your dialysis social worker."
                        showError = true
                        HapticManager.shared.error()
                    }
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = "Unable to look up your referral. Please check your internet connection and try again."
                    showError = true
                    HapticManager.shared.error()
                }
            }
        }
    }

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }

    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}

// Model for referral lookup data
struct ReferralLookupData: Codable {
    let referralToken: String
    let email: String
    let firstName: String
    let lastName: String
    let title: String?
    let nephrologist: String?
    let dialysisClinic: String
    let socialWorkerName: String
    let socialWorkerId: String?
}

#Preview {
    ReferralEmailLookupView(
        showReferralFlow: .constant(true),
        referralData: .constant(nil)
    )
    .environmentObject(AppState())
}
