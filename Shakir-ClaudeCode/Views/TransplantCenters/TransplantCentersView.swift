//
//  TransplantCentersView.swift
//  Transplant Platform - Patient Mobile App
//
//  Transplant center selection view
//

import SwiftUI

struct TransplantCentersView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    Text("Transplant Centers")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding()
                    
                    Text("Transplant center selection will be implemented here")
                        .foregroundColor(.secondary)
                        .padding()
                    
                    Spacer()
                }
            }
            .navigationTitle("Centers")
        }
    }
}

#Preview {
    TransplantCentersView()
}