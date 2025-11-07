//
//  PatientProfileView.swift
//  Transplant Platform - Patient Mobile App
//
//  Patient profile management view
//

import SwiftUI

struct PatientProfileView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    Text("Patient Profile")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding()
                    
                    Text("Profile form will be implemented here")
                        .foregroundColor(.secondary)
                        .padding()
                    
                    Spacer()
                }
            }
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    PatientProfileView()
}