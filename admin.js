const API_URL = window.location.origin + '/api/auth';
let currentEditUserId = null;
let allUsers = [];

async function checkAdminAccess() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'auth.html';
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        
        if (data.user.role !== 'admin') {
            alert('Access denied. Admin only.');
            window.location.href = 'dashboard.html';
            return false;
        }

        return true;
    } catch (error) {
        console.error('Admin access check failed:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'auth.html';
        return false;
    }
}

async function loadUsers() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const data = await response.json();
        allUsers = data.users;
        
        displayUsers(allUsers);
        updateStats(allUsers);
        
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableBody').innerHTML = 
            '<tr><td colspan="8" style="text-align: center; color: #ff4444;">Failed to load users</td></tr>';
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        const expiresDate = user.subscription_expires ? new Date(user.subscription_expires).toLocaleDateString() : '-';
        const createdDate = new Date(user.created_at).toLocaleDateString();
        const isActive = user.subscription_expires && new Date(user.subscription_expires) > new Date();
        
        return `
            <tr>
                <td>${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td><span class="role-badge ${user.role}">${user.role}</span></td>
                <td><span class="sub-badge ${isActive ? 'active' : ''}">${user.subscription_type}</span></td>
                <td>${expiresDate}</td>
                <td>${createdDate}</td>
                <td>
                    <button class="edit-btn" onclick="openEditModal(${user.id})">
                        <i data-lucide="edit"></i> Edit
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    lucide.createIcons();
}

function updateStats(users) {
    document.getElementById('totalUsers').textContent = users.length;
    
    const activeSubscriptions = users.filter(u => 
        u.subscription_expires && new Date(u.subscription_expires) > new Date()
    ).length;
    document.getElementById('activeSubscriptions').textContent = activeSubscriptions;
    
    const adminCount = users.filter(u => u.role === 'admin').length;
    document.getElementById('adminCount').textContent = adminCount;
}

function openEditModal(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    currentEditUserId = userId;
    
    document.getElementById('editUsername').textContent = `${user.username} (${user.email})`;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editSubscription').value = user.subscription_type;
    document.getElementById('editDays').value = '';
    
    document.getElementById('editModal').style.display = 'flex';
    lucide.createIcons();
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditUserId = null;
}

async function saveUserChanges() {
    if (!currentEditUserId) return;
    
    const token = localStorage.getItem('token');
    const role = document.getElementById('editRole').value;
    const subscriptionType = document.getElementById('editSubscription').value;
    const days = document.getElementById('editDays').value;
    
    try {
        // Update role
        await fetch(`${API_URL}/admin/update-role`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentEditUserId, role })
        });
        
        // Update subscription
        await fetch(`${API_URL}/admin/update-subscription`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                userId: currentEditUserId, 
                subscriptionType,
                days: days || 0
            })
        });
        
        alert('User updated successfully!');
        closeEditModal();
        loadUsers();
        
    } catch (error) {
        console.error('Save changes error:', error);
        alert('Failed to update user');
    }
}

async function deleteUser() {
    if (!currentEditUserId) return;
    
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/delete-user/${currentEditUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        
        alert('User deleted successfully!');
        closeEditModal();
        loadUsers();
        
    } catch (error) {
        console.error('Delete user error:', error);
        alert('Failed to delete user');
    }
}

// Initialize
window.addEventListener('load', async () => {
    const hasAccess = await checkAdminAccess();
    if (hasAccess) {
        loadUsers();
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeEditModal();
    }
}
