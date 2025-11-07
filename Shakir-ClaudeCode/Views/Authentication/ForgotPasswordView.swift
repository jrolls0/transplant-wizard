//
//  ForgotPasswordView.swift
//  Transplant Platform - Patient Mobile App
//
//  Password reset flow
//

import SwiftUI

struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Reset Password")
                    .font(.title2)
                    .fontWeight(.bold)
                    .padding()
                
                Text("Password reset form will be implemented here")
                    .foregroundColor(.secondary)
                    .padding()
                
                Spacer()
            }
            .padding(.horizontal, 20)
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    ForgotPasswordView()
}