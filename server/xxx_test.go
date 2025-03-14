package main

import (
	"fmt"
	"github.com/stretchr/testify/require"
	"math/rand"
	"slices"
	"testing"
	"unsafe"
)

func TestXxxx(t *testing.T) {
	var b = make([]byte, 128, 512)
	rand.Read(b)

	b1 := slices.Clone(b)
	b = append(b[:1], b...)
	b2 := b[1:]

	require.Equal(t, b1, b2)

	ptr := uintptr(unsafe.Pointer(unsafe.SliceData(b)))
	ptr1 := uintptr(unsafe.Pointer(unsafe.SliceData(b1)))
	ptr2 := uintptr(unsafe.Pointer(unsafe.SliceData(b2)))
	require.Equal(t, ptr+1, ptr2)

	fmt.Println(ptr + 1)
	fmt.Println(ptr1)
	fmt.Println(ptr2)
}
