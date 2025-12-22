//
//  TransplantCentersView.swift
//  Transplant Platform - Patient Mobile App
//
//  View and manage patient's transplant center applications
//

import SwiftUI

struct TransplantCentersView: View {
    @StateObject private var viewModel = TransplantCentersViewModel()
    @State private var showingAddCenter = false
    @State private var showingRemoveAlert = false
    @State private var centerToRemove: PatientTransplantCenter? = nil
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Header Stats
                    statsHeader
                    
                    // My Centers Section
                    if !viewModel.myCenters.isEmpty {
                        myCentersSection
                    } else if !viewModel.isLoading {
                        emptyCentersView
                    }
                    
                    // Add Center Button
                    addCenterButton
                    
                    Spacer(minLength: 40)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Transplant Centers")
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                viewModel.loadMyCenters()
            }
            .sheet(isPresented: $showingAddCenter) {
                AddTransplantCenterView(viewModel: viewModel)
            }
            .alert("Remove Center", isPresented: $showingRemoveAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Remove", role: .destructive) {
                    if let center = centerToRemove {
                        viewModel.removeCenter(center)
                    }
                }
            } message: {
                if let center = centerToRemove {
                    Text("Are you sure you want to remove \(center.name) from your list? The center will be notified.")
                }
            }
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.2))
                }
            }
        }
    }
    
    // MARK: - Stats Header
    
    private var statsHeader: some View {
        HStack(spacing: 16) {
            StatCard(
                title: "Applied",
                value: "\(viewModel.myCenters.count)",
                icon: "building.2.fill",
                color: .blue
            )
            
            StatCard(
                title: "Accepted",
                value: "\(viewModel.myCenters.filter { $0.status == .accepted }.count)",
                icon: "checkmark.circle.fill",
                color: .green
            )
            
            StatCard(
                title: "Waitlisted",
                value: "\(viewModel.myCenters.filter { $0.status == .waitlisted }.count)",
                icon: "clock.fill",
                color: .orange
            )
        }
    }
    
    // MARK: - My Centers Section
    
    private var myCentersSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("My Centers")
                .font(.headline)
                .padding(.horizontal, 4)
            
            ForEach(viewModel.myCenters) { center in
                TransplantCenterCard(
                    center: center,
                    onRemove: {
                        centerToRemove = center
                        showingRemoveAlert = true
                    }
                )
            }
        }
    }
    
    // MARK: - Empty View
    
    private var emptyCentersView: some View {
        VStack(spacing: 16) {
            Image(systemName: "building.2")
                .font(.system(size: 60))
                .foregroundColor(.gray.opacity(0.5))
            
            Text("No Transplant Centers")
                .font(.title3)
                .fontWeight(.semibold)
            
            Text("Add transplant centers to track your applications and stay connected with your care team.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding(.vertical, 40)
    }
    
    // MARK: - Add Center Button
    
    private var addCenterButton: some View {
        Button {
            showingAddCenter = true
        } label: {
            HStack {
                Image(systemName: "plus.circle.fill")
                Text("Add Transplant Center")
            }
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                LinearGradient(
                    colors: [Color.blue, Color.purple.opacity(0.8)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(12)
        }
        .padding(.top, 8)
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Transplant Center Card

struct TransplantCenterCard: View {
    let center: PatientTransplantCenter
    let onRemove: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(center.name)
                        .font(.headline)
                    
                    if let address = center.address {
                        Text(address)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
                
                StatusBadge(status: center.status)
            }
            
            Divider()
            
            // Details
            HStack(spacing: 20) {
                if let phone = center.phone {
                    Button {
                        if let url = URL(string: "tel://\(phone.replacingOccurrences(of: "-", with: ""))") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "phone.fill")
                            Text("Call")
                        }
                        .font(.caption)
                        .foregroundColor(.blue)
                    }
                }
                
                if let email = center.email {
                    Button {
                        if let url = URL(string: "mailto:\(email)") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "envelope.fill")
                            Text("Email")
                        }
                        .font(.caption)
                        .foregroundColor(.blue)
                    }
                }
                
                Spacer()
                
                Button(action: onRemove) {
                    HStack {
                        Image(systemName: "xmark.circle")
                        Text("Remove")
                    }
                    .font(.caption)
                    .foregroundColor(.red)
                }
            }
            
            // Applied Date
            if let appliedAt = center.appliedAt {
                Text("Applied: \(appliedAt, style: .date)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 5, x: 0, y: 2)
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: CenterApplicationStatus
    
    var body: some View {
        Text(status.displayName)
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(status.color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(status.color.opacity(0.15))
            .cornerRadius(8)
    }
}

// MARK: - Add Transplant Center View

struct AddTransplantCenterView: View {
    @ObservedObject var viewModel: TransplantCentersViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    
    var filteredCenters: [TransplantCenter] {
        if searchText.isEmpty {
            return viewModel.availableCenters
        }
        return viewModel.availableCenters.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            ($0.city?.localizedCaseInsensitiveContains(searchText) ?? false) ||
            ($0.state?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }
    
    var body: some View {
        NavigationView {
            VStack {
                // Search Bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Search centers...", text: $searchText)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding()
                
                // Centers List
                List(filteredCenters) { center in
                    let isAlreadyAdded = viewModel.myCenters.contains { $0.id == center.id }
                    
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(center.name)
                                .fontWeight(.medium)
                            
                            if let city = center.city, let state = center.state {
                                Text("\(city), \(state)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        Spacer()
                        
                        if isAlreadyAdded {
                            Text("Added")
                                .font(.caption)
                                .foregroundColor(.green)
                        } else {
                            Button {
                                viewModel.addCenter(center)
                                dismiss()
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listStyle(.plain)
            }
            .navigationTitle("Add Center")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                viewModel.loadAvailableCenters()
            }
        }
    }
}

#Preview {
    TransplantCentersView()
}