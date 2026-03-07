const API_URL = window.location.origin + '/api/auth';
let currentEditUserId = null;
let allUsers = [];

async function checkAdminAccess() {
    const token = localStorage.getItem('token');
    const adminAccess = sessionStorage.getItem('adminAccess');

    if (!token) {
        window.location.href = 'auth';
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();

        if (data.user.role !== 'admin') {
            alert('Access denied. Admin only.');
            window.location.href = 'dashboard';
            return false;
        }

        if (adminAccess !== 'granted') {
            window.location.href = 'admin-auth';
            return false;
        }

        return true;
    } catch (error) {
        console.error('Admin access check failed:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'auth';
        return false;
    }
}

function formatExpires(user) {
    if (user.subscription_type === 'lifetime') {
        return 'Never';
    }
    return user.subscription_expires ? new Date(user.subscription_expires).toLocaleDateString() : '-';
}

function renderSubscriptionLabel(user) {
    if (user.license_text) {
        return user.license_text;
    }
    return user.subscription_type || 'none';
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((user) => {
        const createdDate = new Date(user.created_at).toLocaleDateString();
        const isActive = user.subscription_type === 'lifetime' ||
            (user.subscription_expires && new Date(user.subscription_expires) > new Date());
        const hwid = user.license_hwid || user.hwid || '-';
        const status = user.status || 'active';

        return `
            <tr>
                <td>${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td><span class="role-badge ${user.role}">${user.role}</span></td>
                <td><span class="sub-badge ${isActive ? 'active' : ''}">${renderSubscriptionLabel(user)}</span></td>
                <td>${formatExpires(user)}</td>
                <td title="${hwid}">${hwid}</td>
                <td><span class="role-badge ${status === 'leaked' ? 'admin' : 'user'}">${status}</span></td>
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

    const activeSubscriptions = users.filter((u) =>
        u.subscription_type === 'lifetime' ||
        (u.subscription_expires && new Date(u.subscription_expires) > new Date())
    ).length;
    document.getElementById('activeSubscriptions').textContent = activeSubscriptions;

    const adminCount = users.filter((u) => u.role === 'admin').length;
    document.getElementById('adminCount').textContent = adminCount;

    const leakedCount = users.filter((u) => (u.status || 'active') === 'leaked').length;
    document.getElementById('leakedCount').textContent = leakedCount;
}

async function loadUsers() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load users');
        }

        const data = await response.json();
        allUsers = data.users || [];

        displayUsers(allUsers);
        updateStats(allUsers);
    } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableBody').innerHTML =
            '<tr><td colspan="10" style="text-align: center; color: #ff4444;">Failed to load users</td></tr>';
    }
}

function openEditModal(userId) {
    const user = allUsers.find((u) => u.id === userId);
    if (!user) return;

    currentEditUserId = userId;

    document.getElementById('editUsername').textContent = `${user.username} (${user.email})`;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editSubscription').value = user.subscription_type || 'none';
    document.getElementById('editDays').value = '';
    document.getElementById('newPassword').value = '';

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
    const newPassword = document.getElementById('newPassword').value;

    try {
        await fetch(`${API_URL}/admin/update-role`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentEditUserId, role })
        });

        await fetch(`${API_URL}/admin/update-subscription`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentEditUserId,
                subscriptionType,
                days: days || 0
            })
        });

        if (newPassword && newPassword.length >= 6) {
            await fetch(`${API_URL}/admin/reset-password`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: currentEditUserId,
                    newPassword
                })
            });
        }

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
            headers: { Authorization: `Bearer ${token}` }
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

function showAntiLeakPanel() {
    alert('Anti-Leak monitoring is active. Check HWID and status columns for suspicious activity.');
}

function showBulkActions() {
    alert('Bulk actions are not implemented yet.');
}

function exportUsers() {
    if (!allUsers.length) {
        alert('No users to export');
        return;
    }

    const csv = [
        ['ID', 'Username', 'Email', 'Role', 'License', 'Expires', 'HWID', 'Status', 'Created'].join(','),
        ...allUsers.map((user) => [
            user.id,
            user.username,
            user.email,
            user.role,
            renderSubscriptionLabel(user),
            formatExpires(user),
            user.license_hwid || user.hwid || '-',
            user.status || 'active',
            new Date(user.created_at).toLocaleDateString()
        ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

async function clearLeakedAccounts() {
    if (!confirm('Are you sure you want to delete all leaked accounts? This action cannot be undone.')) {
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/admin/clear-leaked`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to clear leaked accounts');
        }

        alert('Leaked accounts cleared successfully!');
        loadUsers();
    } catch (error) {
        console.error('Clear leaked error:', error);
        alert('Failed to clear leaked accounts');
    }
}


function setKeyGenStatus(message, isError = false) {
    const status = document.getElementById('keyGenStatus');
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('error', isError);
    status.classList.toggle('success', !isError);
}

async function generateLicenseKeys() {
    const token = localStorage.getItem('token');
    const plan = document.getElementById('keyGenPlan')?.value;
    const countRaw = document.getElementById('keyGenCount')?.value;
    const count = Number(countRaw);
    const generateBtn = document.getElementById('generateKeysBtn');
    const output = document.getElementById('generatedKeysOutput');

    if (!token) {
        window.location.href = 'auth';
        return;
    }

    if (!plan) {
        setKeyGenStatus('Select a plan first.', true);
        return;
    }

    if (!Number.isInteger(count) || count < 1 || count > 5000) {
        setKeyGenStatus('Count must be a whole number between 1 and 5000.', true);
        return;
    }

    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i data-lucide="loader"></i> Generating...';
        lucide.createIcons();
    }

    try {
        const response = await fetch(`${API_URL}/admin/license/generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan, count })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            setKeyGenStatus(data.error || 'Failed to generate keys.', true);
            return;
        }

        if (output) {
            output.value = data.text || '';
        }

        setKeyGenStatus(`Generated ${data.count} keys for ${data.planLabel}.`, false);
    } catch (error) {
        console.error('Generate keys error:', error);
        setKeyGenStatus('Server error while generating keys.', true);
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i data-lucide="wand-sparkles"></i> Generate Keys';
            lucide.createIcons();
        }
    }
}

function copyGeneratedKeys() {
    const output = document.getElementById('generatedKeysOutput');
    const value = output ? output.value.trim() : '';

    if (!value) {
        setKeyGenStatus('There are no generated keys to copy.', true);
        return;
    }

    navigator.clipboard.writeText(value).then(() => {
        setKeyGenStatus('Generated keys copied to clipboard.', false);
    }).catch(() => {
        setKeyGenStatus('Failed to copy generated keys.', true);
    });
}
window.addEventListener('load', async () => {
    const hasAccess = await checkAdminAccess();
    if (hasAccess) {
        const generateBtn = document.getElementById('generateKeysBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', generateLicenseKeys);
        }

        loadUsers();
    }
});

window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeEditModal();
    }
};

