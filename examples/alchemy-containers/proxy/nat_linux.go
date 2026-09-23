package main

import (
	"context"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

// DNS is deliberately sent to an explicit resolver. This preserves the upstream
// policy decisions but not applications' selection of arbitrary DNS resolvers.
var natDNSUpstream = flag.String("nat-dns-upstream", "1.1.1.1:53", "IPv4 upstream for permitted DNS queries in experimental NAT mode")

func natOriginalTCPDestination(conn *net.TCPConn) (*net.TCPAddr, error) {
	raw, err := conn.SyscallConn()
	if err != nil {
		return nil, err
	}
	var addr [16]byte
	size := uint32(len(addr))
	var socketErr error
	err = raw.Control(func(fd uintptr) {
		_, _, errno := syscall.Syscall6(syscall.SYS_GETSOCKOPT, fd, syscall.SOL_IP, 80, uintptr(unsafe.Pointer(&addr[0])), uintptr(unsafe.Pointer(&size)), 0)
		if errno != 0 {
			socketErr = errno
		}
	})
	if err != nil {
		return nil, err
	}
	if socketErr != nil {
		return nil, socketErr
	}
	if size < 8 || binary.NativeEndian.Uint16(addr[:2]) != syscall.AF_INET {
		return nil, errors.New("unexpected SO_ORIGINAL_DST family")
	}
	return &net.TCPAddr{IP: net.IPv4(addr[4], addr[5], addr[6], addr[7]), Port: int(binary.BigEndian.Uint16(addr[2:4]))}, nil
}

func configureNAT(ctx context.Context, tcp *proxy, dns *dnsProxy, ignored []string) error {
	// The app and sidecar share one network namespace, so application egress
	// traverses OUTPUT. Deliberately leave PREROUTING alone: it carries ingress.
	// Priority -101 precedes Docker's nat OUTPUT rules (notably embedded DNS).
	runCommand(ctx, "nft", "delete", "table", "ip", "e2b_cf_nat")
	var rules strings.Builder
	rules.WriteString("table ip e2b_cf_nat {\nchain output {\ntype nat hook output priority -101; policy accept;\nmeta mark 100 return\n")
	if dns != nil {
		fmt.Fprintf(&rules, "udp dport 53 dnat to %s:%d\n", dns.addr.IP.String(), dns.addr.Port)
	}
	// Keep upstream's local/Docker exclusions. Control traffic and proxy CONNECT
	// connections target the Docker gateway and therefore cannot redirect recursively.
	for _, cidr := range ignored {
		if _, _, err := net.ParseCIDR(cidr); err != nil {
			return fmt.Errorf("invalid excluded CIDR %q: %w", cidr, err)
		}
		fmt.Fprintf(&rules, "ip daddr %s return\n", cidr)
	}
	fmt.Fprintf(&rules, "meta l4proto tcp dnat to %s:%d\n}\n}\n", tcp.addr.IP.String(), tcp.addr.Port)
	command := exec.CommandContext(ctx, "nft", "-f", "-")
	command.Stdin = strings.NewReader(rules.String())
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("install NAT interception: %w: %s", err, output)
	}
	return nil
}
